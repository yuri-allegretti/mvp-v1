import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  auditRecurrenceCandidates,
  detectPublishedRaw,
  loadGroundTruth,
  loadPublishedTransactions,
  markdownTable,
  reconcileTransactions,
} from "./audit-fixture-support";
import { consolidateCoreRecurrenceSuggestions } from "../src/modules/recurrences/services/recurrenceSuggestionConsolidation";

const historicalLosses: Record<string, { chosenCanonical: string; lostReason: string }> = {
  "rec-company-001-loan-12x-001": {
    chosenCanonical: "rec_published-company-001_y5txhi (23 transacoes, score 62)",
    lostReason: "superset contaminado venceu o grupo exato de 12 transacoes",
  },
  "rec-company-002-reforma-8x-001": {
    chosenCanonical: "rec_published-company-002_66g6qt (18 transacoes, score 75)",
    lostReason: "merge de reforma e forno substituiu os dois parcelamentos",
  },
  "rec-company-002-forno-10x-001": {
    chosenCanonical: "rec_published-company-002_66g6qt (18 transacoes, score 75)",
    lostReason: "merge de reforma e forno substituiu os dois parcelamentos",
  },
  "rec-company-003-campaign-burst-4x-001": {
    chosenCanonical: "rec_published-company-003_9sf4yo (31 transacoes, score 83)",
    lostReason: "receita ampla com overlap conteve o burst temporario de 4 transacoes",
  },
  "rec-company-004-ultrasound-12x-001": {
    chosenCanonical: "rec_published-company-004_p21830 (17 transacoes, score 64)",
    lostReason: "merge de equipamentos e adequacao venceu o parcelamento exato",
  },
  "rec-company-004-specialty-project-6x-001": {
    chosenCanonical: "rec_published-company-004_x88zco (28 transacoes, score 61)",
    lostReason: "receita mensal contaminada venceu o projeto temporario",
  },
  "rec-company-004-fitout-5x-001": {
    chosenCanonical: "rec_published-company-004_p21830 (17 transacoes, score 64)",
    lostReason: "merge de equipamentos e adequacao venceu o parcelamento exato",
  },
  "rec-company-005-payroll-001": {
    chosenCanonical: "rec_published-company-005_om71we (64 transacoes, score 69)",
    lostReason: "grupo amplo de despesas venceu a folha exata de 24 meses",
  },
};

async function main(): Promise<void> {
  const [ground, transactions] = await Promise.all([
    loadGroundTruth(),
    loadPublishedTransactions(),
  ]);
  const raw = await detectPublishedRaw(transactions);
  const reconciliation = reconcileTransactions(transactions, ground.importedTransactions);
  const rawAudit = auditRecurrenceCandidates({
    candidates: raw,
    reconciliation,
    ground,
    persistedTransactionCount: transactions.length,
  });
  const consolidated = consolidateCoreRecurrenceSuggestions(
    raw,
    new Map(transactions.map((transaction) => [transaction.id, transaction])),
  );
  const consolidatedAudit = auditRecurrenceCandidates({
    candidates: consolidated,
    reconciliation,
    ground,
    persistedTransactionCount: transactions.length,
  });
  const represented = new Set(consolidatedAudit.summary.detectedGroupIds);
  const groupById = new Map(ground.recurrenceGroups.map((group) => [group.id, group]));

  const rows = Object.entries(historicalLosses).map(([groupId, historical]) => {
    const group = groupById.get(groupId);
    const rawCandidates = rawAudit.candidates
      .filter((candidate) => candidate.bestGroundTruthGroupId === groupId)
      .sort((left, right) => right.f1 - left.f1 || right.confidenceScore - left.confidenceScore);
    const current = consolidatedAudit.candidates.filter(
      (candidate) => candidate.bestGroundTruthGroupId === groupId,
    );
    return [
      groupId,
      group?.companyId ?? "-",
      `${group?.frequency ?? "-"}; ${group?.transactions.length ?? 0} transacoes`,
      rawCandidates
        .slice(0, 3)
        .map((candidate) => `${candidate.id} (${candidate.classification}, ${candidate.transactionCount})`)
        .join("<br>"),
      historical.chosenCanonical,
      historical.lostReason,
      represented.has(groupId)
        ? `recuperado: ${current.map((candidate) => candidate.id).join(", ")}`
        : "ainda ausente",
      "identidade economica + ranking por coerencia + protecao contra bridge/merge",
    ];
  });

  const report = [
    "# Grupos perdidos pela consolidacao de recorrencias",
    "",
    `Gerado em: ${new Date().toISOString()}`,
    "",
    "## Causa raiz",
    "",
    "A versao anterior usava `intersection / min(set sizes)` como equivalencia e ordenava primeiro por quantidade de transacoes. Assim, um superset contaminado contendo todo o grupo real era considerado equivalente e vencia mesmo com score e coerencia muito inferiores.",
    "",
    markdownTable(
      [
        "groundTruthGroupId",
        "companyId",
        "expectedPattern",
        "rawCandidates",
        "chosenCanonical anterior",
        "lostReason",
        "estado atual",
        "recommendedFix",
      ],
      rows,
    ),
    "",
    "## Medicao atual em memoria",
    "",
    markdownTable(
      ["Metrica", "Resultado"],
      [
        ["Raw", raw.length],
        ["Consolidadas", consolidated.length],
        ["Grupos representados", `${consolidatedAudit.summary.groupsDetected}/${ground.recurrenceGroups.length}`],
        ["Grupos ausentes", consolidatedAudit.summary.absentGroupIds.length],
        ["Classificacoes", JSON.stringify(consolidatedAudit.summary.byClassification)],
      ],
    ),
    "",
    "O ground truth e usado somente neste script de auditoria. A consolidacao de runtime nao recebe IDs ou classificacoes esperadas.",
    "",
  ].join("\n");
  await writeFile(
    path.join(process.cwd(), "RECURRENCE_CONSOLIDATION_LOST_GROUPS.md"),
    report,
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        report: "RECURRENCE_CONSOLIDATION_LOST_GROUPS.md",
        raw: raw.length,
        consolidated: consolidated.length,
        representedGroups: consolidatedAudit.summary.groupsDetected,
        absentGroups: consolidatedAudit.summary.absentGroupIds,
        byClassification: consolidatedAudit.summary.byClassification,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
