import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  auditRecurrenceCandidates,
  coreCandidate,
  detectPublishedRaw,
  loadGroundTruth,
  loadPublishedTransactions,
  markdownTable,
  percentage,
  prisma,
  reconcileTransactions,
  type CandidateAudit,
} from "./audit-fixture-support";

function topByCompany(candidates: CandidateAudit[], classification: string): CandidateAudit[] {
  const grouped = new Map<string, CandidateAudit[]>();
  for (const candidate of candidates.filter((item) => item.classification === classification)) {
    grouped.set(candidate.companyId, [...(grouped.get(candidate.companyId) ?? []), candidate]);
  }
  return [...grouped.values()].flatMap((rows) =>
    rows
      .sort(
        (left, right) =>
          right.transactionCount - left.transactionCount ||
          right.confidenceScore - left.confidenceScore,
      )
      .slice(0, 10),
  );
}

async function main(): Promise<void> {
  const ground = await loadGroundTruth();
  const transactions = await loadPublishedTransactions();
  const reconciliation = reconcileTransactions(transactions, ground.importedTransactions);
  const raw = await detectPublishedRaw(transactions);
  const syntheticIdCounts = new Map<string, number>();
  for (const transaction of ground.importedTransactions) {
    syntheticIdCounts.set(transaction.id, (syntheticIdCounts.get(transaction.id) ?? 0) + 1);
  }
  const duplicatedSyntheticIds = [...syntheticIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));
  const audit = auditRecurrenceCandidates({
    candidates: raw.map(coreCandidate),
    reconciliation,
    ground,
    persistedTransactionCount: transactions.length,
  });
  const groupById = new Map(ground.recurrenceGroups.map((group) => [group.id, group]));
  const topFalsePositives = topByCompany(audit.candidates, "false_positive");
  const topAmbiguous = topByCompany(audit.candidates, "ambiguous");
  const fragmentations = audit.summary.fragmentedGroupIds
    .map((groupId) => {
      const candidates = audit.candidates.filter(
        (item) =>
          item.bestGroundTruthGroupId === groupId && item.classification !== "duplicate_variant",
      );
      return {
        groupId,
        companyId: groupById.get(groupId)?.companyId ?? "unknown",
        description: groupById.get(groupId)?.descriptionBase ?? "unknown",
        candidates: candidates.length,
        bestRecall: Math.max(...candidates.map((item) => item.recall)),
      };
    })
    .sort((left, right) => right.candidates - left.candidates || left.groupId.localeCompare(right.groupId));
  const descriptions = new Map<string, number>();
  for (const candidate of audit.candidates) {
    const key = `${candidate.companyId}|${candidate.normalizedDescription}`;
    descriptions.set(key, (descriptions.get(key) ?? 0) + 1);
  }
  const descriptionVariations = [...descriptions.entries()]
    .map(([key, count]) => ({ key, count }))
    .filter((item) => item.count > 1)
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, 50);

  const falsePositiveCount = audit.summary.byClassification.false_positive ?? 0;
  const ambiguousCount = audit.summary.byClassification.ambiguous ?? 0;
  const duplicateCount = audit.summary.byClassification.duplicate_variant ?? 0;
  const mergeCount = audit.summary.byClassification.merge_error ?? 0;
  const partialCount = audit.summary.byClassification.partial_match ?? 0;
  const mainProblem =
    falsePositiveCount + ambiguousCount >= duplicateCount + partialCount + mergeCount
      ? "excesso de candidatos sem grupo publicado (falsos positivos e padroes ambiguos)"
      : duplicateCount + partialCount >= falsePositiveCount + ambiguousCount
        ? "fragmentacao e variacoes redundantes"
        : "merges indevidos";

  const report = [
    "# Auditoria raw de recorrencias vs ground truth",
    "",
    `Gerado em: ${audit.generatedAt}`,
    "",
    "## Metodo",
    "",
    "Cada transacao persistida e reconciliada com o ID sintetico por empresa, data, valor, descricao, documento e contraparte. A classificacao usa pertencimento transacional: `exact_match` exige precisao >= 90%, cobertura >= 80% e frequencia compativel; `partial_match` tem um grupo dominante com ao menos duas transacoes; `merge_error` mistura dois grupos com intersecoes relevantes; `duplicate_variant` sobrepoe mais de 70% de um candidato melhor; sem grupo, transferencias e padroes sem identidade estavel sao `false_positive`, enquanto repeticoes de contraparte em quatro ou mais meses sao `ambiguous`.",
    "",
    "## Resumo",
    "",
    markdownTable(
      ["Metrica", "Resultado"],
      [
        ["Transactions reconciliadas", `${audit.reconciliation.mapped}/${audit.reconciliation.persisted}`],
        ["IDs sinteticos duplicados no ground truth", duplicatedSyntheticIds.length],
        ["Transactions com identidade ground truth ambigua", audit.reconciliation.ambiguousPersistedIds.length],
        ["Sugestoes raw", audit.summary.total],
        ["Grupos esperados", audit.summary.expectedGroups],
        ["Grupos detectados", audit.summary.groupsDetected],
        ["Grupos exatos", audit.summary.groupsExact],
        ["Grupos apenas parciais", audit.summary.groupsPartial],
        ["Grupos fragmentados", audit.summary.groupsFragmented],
        ["Grupos ausentes", audit.summary.groupsAbsent],
      ],
    ),
    "",
    "### Classificacao dos 390 raw",
    "",
    markdownTable(
      ["Classificacao", "Quantidade", "%"],
      Object.entries(audit.summary.byClassification).map(([key, value]) => [
        key,
        value,
        percentage(value, audit.summary.total),
      ]),
    ),
    "",
    "### Dimensoes",
    "",
    "Por empresa:",
    "",
    markdownTable(["Empresa", "Raw"], Object.entries(audit.summary.byCompany)),
    "",
    "Por `patternKind`:",
    "",
    markdownTable(["patternKind", "Raw"], Object.entries(audit.summary.byPatternKind)),
    "",
    "Por `recurrenceType`:",
    "",
    markdownTable(["recurrenceType", "Raw"], Object.entries(audit.summary.byRecurrenceType)),
    "",
    "## Cobertura dos 46 grupos",
    "",
    `Detectados: ${audit.summary.groupsDetected}. Exatos: ${audit.summary.groupsExact}. Apenas parciais: ${audit.summary.groupsPartial}. Fragmentados: ${audit.summary.groupsFragmented}. Ausentes: ${audit.summary.groupsAbsent}.`,
    "",
    "Grupos ausentes:",
    "",
    audit.summary.absentGroupIds.length > 0
      ? audit.summary.absentGroupIds.map((id) => `- \`${id}\``).join("\n")
      : "Nenhum.",
    "",
    "IDs sinteticos duplicados no arquivo canonico:",
    "",
    duplicatedSyntheticIds.length > 0
      ? duplicatedSyntheticIds.map((item) => `- \`${item.id}\`: ${item.count} linhas`).join("\n")
      : "Nenhum.",
    "",
    "### Top fragmentacoes",
    "",
    markdownTable(
      ["Empresa", "Grupo", "Descricao", "Candidatos", "Melhor cobertura"],
      fragmentations.slice(0, 50).map((item) => [
        item.companyId,
        item.groupId,
        item.description,
        item.candidates,
        percentage(item.bestRecall, 1),
      ]),
    ),
    "",
    "### Top falsos positivos por empresa",
    "",
    markdownTable(
      ["Empresa", "Descricao", "Padrao", "Transacoes", "Score", "Motivo"],
      topFalsePositives.map((item) => [
        item.companyId,
        item.representativeDescription,
        item.patternKind ?? "null",
        item.transactionCount,
        item.confidenceScore,
        item.rationale,
      ]),
    ),
    "",
    "### Padroes ambiguos plausiveis",
    "",
    markdownTable(
      ["Empresa", "Descricao", "Padrao", "Transacoes", "Score"],
      topAmbiguous.map((item) => [
        item.companyId,
        item.representativeDescription,
        item.patternKind ?? "null",
        item.transactionCount,
        item.confidenceScore,
      ]),
    ),
    "",
    "### Descricoes normalizadas com mais variacoes",
    "",
    markdownTable(
      ["Empresa e descricao", "Variacoes"],
      descriptionVariations.map((item) => [item.key, item.count]),
    ),
    "",
    "## Respostas objetivas",
    "",
    `1. Dos 46 grupos, ${audit.summary.groupsDetected} foram detectados por ao menos um candidato dominante.`,
    `2. ${audit.summary.groupsExact} foram detectados exatamente.`,
    `3. ${audit.summary.groupsPartial} ficaram apenas parciais.`,
    `4. ${audit.summary.groupsFragmented} foram fragmentados em mais de um candidato nao redundante.`,
    `5. ${audit.summary.groupsAbsent} nao foram detectados.`,
    `6. Dos ${audit.summary.total} raw, ${falsePositiveCount} sao falsos positivos claros.`,
    `7. ${ambiguousCount} sao plausiveis ou ambiguos fora do ground truth.`,
    `8. O problema dominante e ${mainProblem}.`,
    "9. A utilidade das sugestoes acionaveis e medida separadamente em `ACTIONABLE_RECURRENCE_AUDIT_REPORT.md`.",
    `10. O alvo de 46 ${falsePositiveCount + ambiguousCount + duplicateCount > audit.summary.expectedGroups ? "nao" : "pode"} e realista sem alterar o core: a saida raw contem variacoes e padroes fora do ground truth que a persistencia so pode consolidar com risco de esconder candidatos plausiveis.`,
    "",
    "## Evidencia detalhada",
    "",
    "O JSON completo, incluindo IDs sinteticos, intersecoes, precisao e cobertura por sugestao, esta em `tmp/recurrence-raw-audit.json`.",
    "",
  ].join("\n");

  await mkdir(path.join(process.cwd(), "tmp"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(process.cwd(), "tmp", "recurrence-raw-audit.json"),
      JSON.stringify(audit, null, 2),
      "utf8",
    ),
    writeFile(path.join(process.cwd(), "RECURRENCE_RAW_AUDIT_REPORT.md"), report, "utf8"),
  ]);
  console.log(
    JSON.stringify(
      {
        report: "RECURRENCE_RAW_AUDIT_REPORT.md",
        json: "tmp/recurrence-raw-audit.json",
        reconciliation: audit.reconciliation,
        duplicatedSyntheticIds,
        summary: audit.summary,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
