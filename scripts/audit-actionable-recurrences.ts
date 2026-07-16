import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  auditRecurrenceCandidates,
  loadGroundTruth,
  loadPublishedTransactions,
  markdownTable,
  percentage,
  persistedCandidate,
  prisma,
  publishedCompanyIds,
  reconcileTransactions,
  type CandidateAudit,
} from "./audit-fixture-support";

type ActionableClassification =
  | "true_positive"
  | "fragmented_true_positive"
  | "duplicate_actionable"
  | "false_positive"
  | "ambiguous";

function actionableClassification(candidate: CandidateAudit): ActionableClassification {
  switch (candidate.classification) {
    case "exact_match":
      return "true_positive";
    case "partial_match":
      return "fragmented_true_positive";
    case "duplicate_variant":
      return "duplicate_actionable";
    case "ambiguous":
      return "ambiguous";
    case "merge_error":
    case "false_positive":
      return "false_positive";
  }
}

function countBy(values: string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)]
      .map((value) => [value, values.filter((item) => item === value).length] as const)
      .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0])),
  );
}

function recommendedDisposition(classification: ActionableClassification): string {
  switch (classification) {
    case "duplicate_actionable":
      return "superseded";
    case "false_positive":
      return "non_actionable/rejected";
    case "true_positive":
    case "fragmented_true_positive":
      return "manter melhor representante";
    case "ambiguous":
      return "revisao humana";
  }
}

async function main(): Promise<void> {
  const ground = await loadGroundTruth();
  const transactions = await loadPublishedTransactions();
  const reconciliation = reconcileTransactions(transactions, ground.importedTransactions);
  const suggestions = await prisma.recurrenceSuggestion.findMany({
    where: {
      companyId: { in: publishedCompanyIds },
      status: { in: ["pending", "edited", "approved"] },
    },
    include: { transactions: { select: { transactionId: true } } },
    orderBy: [{ companyId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const recurrenceAudit = auditRecurrenceCandidates({
    candidates: suggestions.map(persistedCandidate),
    reconciliation,
    ground,
    persistedTransactionCount: transactions.length,
  });
  const openPending = await prisma.pendingItem.findMany({
    where: {
      companyId: { in: publishedCompanyIds },
      type: "recurrence_approval",
      status: { in: ["open", "in_review"] },
      recurrenceSuggestionId: { not: null },
    },
    select: { recurrenceSuggestionId: true },
  });
  const pendingSuggestionIds = new Set(
    openPending
      .map((pending) => pending.recurrenceSuggestionId)
      .filter((id): id is string => Boolean(id)),
  );
  const candidates = recurrenceAudit.candidates.map((candidate) => ({
    ...candidate,
    actionableClassification: actionableClassification(candidate),
    openRecurrenceApproval: pendingSuggestionIds.has(candidate.id),
    recommendedDisposition: recommendedDisposition(actionableClassification(candidate)),
  }));
  const byClassification = countBy(candidates.map((item) => item.actionableClassification));
  const matchedGroups = new Set(
    candidates
      .filter((item) =>
        ["true_positive", "fragmented_true_positive", "duplicate_actionable"].includes(
          item.actionableClassification,
        ),
      )
      .map((item) => item.bestGroundTruthGroupId)
      .filter((id): id is string => Boolean(id)),
  );
  const redundantFragments = [...matchedGroups].reduce((total, groupId) => {
    const rows = candidates.filter(
      (item) =>
        item.bestGroundTruthGroupId === groupId &&
        ["true_positive", "fragmented_true_positive"].includes(item.actionableClassification),
    );
    return total + Math.max(rows.length - 1, 0);
  }, 0);
  const duplicateActionable = byClassification.duplicate_actionable ?? 0;
  const clearFalsePositive = byClassification.false_positive ?? 0;
  const ambiguous = byClassification.ambiguous ?? 0;
  const usefulRows =
    (byClassification.true_positive ?? 0) +
    (byClassification.fragmented_true_positive ?? 0);
  const strictCounter = matchedGroups.size;
  const missingGroundTruthGroupIds = ground.recurrenceGroups
    .map((group) => group.id)
    .filter((id) => !matchedGroups.has(id));
  const humanReviewCounter = strictCounter + ambiguous;
  const shouldSupersede = duplicateActionable + redundantFragments;
  const acceptableRatio = (usefulRows + ambiguous) / Math.max(candidates.length, 1);
  const mvpAssessment =
    acceptableRatio >= 0.7 && clearFalsePositive <= candidates.length * 0.2
      ? "aceitavel com revisao humana e limitacao documentada"
      : "alto demais para exposicao sem triagem adicional";

  const report = [
    "# Auditoria das recorrencias acionaveis",
    "",
    `Gerado em: ${new Date().toISOString()}`,
    "",
    "## Escopo",
    "",
    "A populacao inclui sugestoes `pending`, `edited` e a sugestao `approved` pelo sumarizador. Isso preserva as 99 sugestoes originalmente acionaveis mesmo depois do teste de aprovacao.",
    "",
    markdownTable(
      ["Metrica", "Resultado"],
      [
        ["Sugestoes auditadas", candidates.length],
        ["Grupos esperados representados", matchedGroups.size],
        ["Grupos esperados sem sugestao acionavel", missingGroundTruthGroupIds.length],
        ["Contador estrito recomendado", strictCounter],
        ["Contador aceitavel para revisao humana", humanReviewCounter],
        ["Sugestoes redundantes para supersede", shouldSupersede],
        ["Falsos positivos claros para rejeicao", clearFalsePositive],
        ["Padroes ambiguos plausiveis", ambiguous],
      ],
    ),
    "",
    "## Classificacao",
    "",
    markdownTable(
      ["Classificacao", "Quantidade", "%"],
      Object.entries(byClassification).map(([classification, count]) => [
        classification,
        count,
        percentage(count, candidates.length),
      ]),
    ),
    "",
    "## Distribuicao por empresa",
    "",
    markdownTable(
      ["Empresa", "Sugestoes"],
      Object.entries(countBy(candidates.map((item) => item.companyId))),
    ),
    "",
    "## Candidatos que nao deveriam permanecer acionaveis",
    "",
    markdownTable(
      [
        "Empresa",
        "Descricao",
        "Classificacao",
        "Grupo",
        "Transacoes",
        "Score",
        "Pendencia aberta",
        "Disposicao",
      ],
      candidates
        .filter((item) =>
          ["duplicate_actionable", "false_positive"].includes(item.actionableClassification),
        )
        .sort(
          (left, right) =>
            right.transactionCount - left.transactionCount ||
            right.confidenceScore - left.confidenceScore,
        )
        .slice(0, 100)
        .map((item) => [
          item.companyId,
          item.representativeDescription,
          item.actionableClassification,
          item.bestGroundTruthGroupId ?? "-",
          item.transactionCount,
          item.confidenceScore,
          item.openRecurrenceApproval ? "sim" : "nao",
          item.recommendedDisposition,
        ]),
    ),
    "",
    "Grupos esperados sem sugestao acionavel:",
    "",
    missingGroundTruthGroupIds.length > 0
      ? missingGroundTruthGroupIds.map((id) => `- \`${id}\``).join("\n")
      : "Nenhum.",
    "",
    "## Respostas objetivas",
    "",
    `1. Pelo ground truth, o contador deveria representar ${strictCounter} grupos detectados; aceitando padroes plausiveis para revisao humana, pode mostrar ${humanReviewCounter}.`,
    `2. ${shouldSupersede} sugestoes sao redundantes ou fragmentos adicionais e deveriam ser superseded se a politica de produto exigir uma linha por grupo.`,
    `3. ${clearFalsePositive} sao falsos positivos claros e deveriam ser rejeitados, nao apenas superseded.`,
    `4. ${usefulRows + ambiguous} sao uteis ou aceitaveis como sugestoes para revisao humana.`,
    `5. O numero ${candidates.length} e ${mvpAssessment}; ${percentage(usefulRows + ambiguous, candidates.length)} da fila e util ou plausivel segundo esta auditoria.`,
    "",
    "## Observacao de produto",
    "",
    "`Ambiguous` nao significa erro comprovado: e uma recorrencia economicamente repetida que o dataset nao publicou como grupo esperado. Remover essas sugestoes automaticamente exigiria uma decisao de produto ou revisao do ground truth, nao apenas uma correcao tecnica.",
    "",
  ].join("\n");
  const json = {
    generatedAt: new Date().toISOString(),
    reconciliation: recurrenceAudit.reconciliation,
    summary: {
      audited: candidates.length,
      byClassification,
      matchedGroundTruthGroups: matchedGroups.size,
      missingGroundTruthGroupIds,
      strictCounter,
      humanReviewCounter,
      shouldSupersede,
      clearFalsePositive,
      ambiguous,
      usefulOrPlausible: usefulRows + ambiguous,
      mvpAssessment,
    },
    candidates,
  };
  await mkdir(path.join(process.cwd(), "tmp"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(process.cwd(), "tmp", "actionable-recurrence-audit.json"),
      JSON.stringify(json, null, 2),
      "utf8",
    ),
    writeFile(path.join(process.cwd(), "ACTIONABLE_RECURRENCE_AUDIT_REPORT.md"), report, "utf8"),
  ]);
  console.log(
    JSON.stringify(
      {
        report: "ACTIONABLE_RECURRENCE_AUDIT_REPORT.md",
        json: "tmp/actionable-recurrence-audit.json",
        summary: json.summary,
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
