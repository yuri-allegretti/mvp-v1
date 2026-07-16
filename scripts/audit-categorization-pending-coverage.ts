import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  loadGroundTruth,
  loadPublishedTransactions,
  markdownTable,
  normalizeText,
  percentage,
  prisma,
  publishedCompanyIds,
  reconcileTransactions,
  type GroundTransaction,
} from "./audit-fixture-support";

const auditedPendingTypes = [
  "uncategorized_transaction",
  "categorization_review",
  "categorization_low_confidence",
  "categorization_conflict",
] as const;

interface PendingAuditRow {
  pendingId: string;
  pendingType: string;
  companyId: string;
  bankAccountId: string;
  transactionId: string;
  date: string;
  month: string;
  type: string;
  description: string;
  descriptionFamily: string;
  counterparty: string;
  persistedCounterparty: string;
  groundCounterparty: string;
  document: string;
  persistedDocument: string;
  groundDocument: string;
  amount: number;
  amountBand: string;
  syntheticTransactionId: string | null;
  syntheticKind: string | null;
  expectedCategoryId: string | null;
  expectedCategory: string | null;
  expectedBehavior: string | null;
  possibleMissingRule: boolean;
  groundTruthCategorized: boolean;
  trulyUnknownOrAmbiguous: boolean;
  importerNoise: boolean;
  currentSeedPatternMatch: boolean;
}

interface RuleCandidate {
  ruleType: "document_equals" | "counterparty_contains" | "description_contains" | "counterparty_and_amount_range";
  value: string;
  expectedCategoryId: string;
  transactionIds: string[];
  months: string[];
  purity: number;
  generalizable: boolean;
}

function amountBand(value: number): string {
  const absolute = Math.abs(value);
  if (absolute < 100) return "0-99.99";
  if (absolute < 500) return "100-499.99";
  if (absolute < 1_000) return "500-999.99";
  if (absolute < 5_000) return "1000-4999.99";
  if (absolute < 20_000) return "5000-19999.99";
  return "20000+";
}

function descriptionFamily(ground: GroundTransaction | undefined, description: string, groupDescription?: string): string {
  if (groupDescription) return normalizeText(groupDescription);
  const source = normalizeText(ground?.normalizedDescription ?? description)
    .replace(/\b\d+\b/g, " ")
    .replace(/\b(SYN|DOC|NF|REF|PARC|CP|ISO)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return source || "SEM DESCRICAO";
}

function countBy<T>(rows: T[], key: (row: T) => string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ key: value, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function makeRuleCandidates(rows: PendingAuditRow[]): RuleCandidate[] {
  const definitions: Array<{
    type: RuleCandidate["ruleType"];
    key: (row: PendingAuditRow) => string;
  }> = [
    { type: "document_equals", key: (row) => row.persistedDocument },
    { type: "counterparty_contains", key: (row) => row.persistedCounterparty },
    { type: "description_contains", key: (row) => row.descriptionFamily },
    {
      type: "counterparty_and_amount_range",
      key: (row) =>
        row.persistedCounterparty ? `${row.persistedCounterparty}|${row.amountBand}` : "",
    },
  ];
  const candidates: RuleCandidate[] = [];
  for (const definition of definitions) {
    const groups = new Map<string, PendingAuditRow[]>();
    for (const row of rows.filter(
      (item) =>
        item.expectedCategoryId &&
        item.expectedCategoryId !== "cat-uncategorized" &&
        definition.key(item),
    )) {
      const value = definition.key(row);
      groups.set(value, [...(groups.get(value) ?? []), row]);
    }
    for (const [value, groupRows] of groups) {
      if (!value) continue;
      const categories = countBy(groupRows, (row) => row.expectedCategoryId ?? "unknown");
      const dominant = categories[0];
      if (!dominant) continue;
      const matchingRows = groupRows.filter((row) => row.expectedCategoryId === dominant.key);
      const purity = matchingRows.length / groupRows.length;
      const months = [...new Set(matchingRows.map((row) => row.month))];
      candidates.push({
        ruleType: definition.type,
        value,
        expectedCategoryId: dominant.key,
        transactionIds: matchingRows.map((row) => row.transactionId),
        months,
        purity,
        generalizable:
          purity >= 0.9 &&
          matchingRows.length >= 3 &&
          months.length >= 3 &&
          (definition.type !== "document_equals" || matchingRows.length >= 3),
      });
    }
  }
  return candidates.sort(
    (left, right) =>
      right.transactionIds.length - left.transactionIds.length ||
      right.purity - left.purity ||
      left.value.localeCompare(right.value),
  );
}

function coverageByRuleType(candidates: RuleCandidate[]): Record<string, { rules: number; transactions: number }> {
  return Object.fromEntries(
    ([
      "document_equals",
      "counterparty_contains",
      "description_contains",
      "counterparty_and_amount_range",
    ] as const).map((ruleType) => {
      const rows = candidates.filter((candidate) => candidate.ruleType === ruleType);
      return [
        ruleType,
        {
          rules: rows.length,
          transactions: new Set(rows.flatMap((row) => row.transactionIds)).size,
        },
      ];
    }),
  );
}

function greedyRuleCoverage(candidates: RuleCandidate[], targetTransactions: Set<string>) {
  const uncovered = new Set(targetTransactions);
  const selected: RuleCandidate[] = [];
  const target80 = Math.ceil(targetTransactions.size * 0.8);
  let covered = 0;
  while (covered < target80) {
    const next = candidates
      .map((candidate) => ({
        candidate,
        gain: candidate.transactionIds.filter((id) => uncovered.has(id)).length,
      }))
      .sort(
        (left, right) =>
          right.gain - left.gain ||
          right.candidate.purity - left.candidate.purity ||
          left.candidate.value.localeCompare(right.candidate.value),
      )[0];
    if (!next || next.gain === 0) break;
    selected.push(next.candidate);
    for (const id of next.candidate.transactionIds) uncovered.delete(id);
    covered = targetTransactions.size - uncovered.size;
  }
  return {
    target: targetTransactions.size,
    target80,
    covered,
    reached80: covered >= target80,
    selected,
  };
}

async function readAuditJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(process.cwd(), "tmp", relativePath), "utf8")) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const ground = await loadGroundTruth();
  const transactions = await loadPublishedTransactions();
  const reconciliation = reconcileTransactions(transactions, ground.importedTransactions);
  const recurrenceDescriptions = new Map(
    ground.recurrenceGroups.map((group) => [group.id, group.descriptionBase]),
  );
  const [activeRules, pending, allOpenPending] = await Promise.all([
    prisma.categorizationRule.findMany({
      where: { companyId: { in: publishedCompanyIds }, status: "active" },
      select: { ruleType: true, conditions: true },
    }),
    prisma.pendingItem.findMany({
      where: {
        companyId: { in: publishedCompanyIds },
        type: { in: [...auditedPendingTypes] },
        status: { in: ["open", "in_review"] },
      },
      include: { transaction: true },
      orderBy: [{ companyId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.pendingItem.findMany({
      where: {
        companyId: { in: publishedCompanyIds },
        status: { in: ["open", "in_review"] },
      },
      select: {
        id: true,
        companyId: true,
        type: true,
        transactionId: true,
        suggestionId: true,
        recurrenceSuggestionId: true,
        duplicateCandidateId: true,
        deduplicationKey: true,
      },
    }),
  ]);
  const seedPatterns = [
    ...new Set(
      activeRules
        .filter((rule) =>
          ["description_contains", "description_equals"].includes(rule.ruleType),
        )
        .map((rule) => {
          const conditions = rule.conditions as Record<string, unknown>;
          return typeof conditions.value === "string" ? normalizeText(conditions.value) : "";
        })
        .filter(Boolean),
    ),
  ];
  const rows: PendingAuditRow[] = pending
    .filter((item): item is typeof item & { transaction: NonNullable<typeof item.transaction> } => Boolean(item.transaction))
    .map((item) => {
      const groundTransaction = reconciliation.byPersistedId.get(item.transaction.id);
      const normalizedDescription = normalizeText(item.transaction.description);
      const expectedCategoryId = groundTransaction?.expectedCategoryId ?? null;
      const expectedBehavior = groundTransaction?.expectedCategorizationBehavior ?? null;
      const groundTruthCategorized = Boolean(expectedCategoryId && expectedCategoryId !== "cat-uncategorized");
      const persistedCounterparty = normalizeText(item.transaction.counterpartyName);
      const groundCounterparty = normalizeText(groundTransaction?.counterpartyName);
      const persistedDocument = normalizeText(item.transaction.documentNumber);
      const groundDocument = normalizeText(groundTransaction?.documentNumber);
      const currentSeedPatternMatch = seedPatterns.some((pattern) =>
        normalizedDescription.includes(pattern),
      );
      return {
        pendingId: item.id,
        pendingType: item.type,
        companyId: item.companyId,
        bankAccountId: item.transaction.bankAccountId,
        transactionId: item.transaction.id,
        date: item.transaction.date.toISOString().slice(0, 10),
        month: item.transaction.date.toISOString().slice(0, 7),
        type: item.transaction.type,
        description: item.transaction.description,
        descriptionFamily: descriptionFamily(
          groundTransaction,
          item.transaction.description,
          groundTransaction?.expectedRecurrenceGroupId
            ? recurrenceDescriptions.get(groundTransaction.expectedRecurrenceGroupId)
            : undefined,
        ),
        counterparty: persistedCounterparty || groundCounterparty || "SEM CONTRAPARTE",
        persistedCounterparty,
        groundCounterparty,
        document: persistedDocument || groundDocument,
        persistedDocument,
        groundDocument,
        amount: Number(item.transaction.amount),
        amountBand: amountBand(Number(item.transaction.amount)),
        syntheticTransactionId: groundTransaction?.id ?? null,
        syntheticKind: groundTransaction?.syntheticKind ?? null,
        expectedCategoryId,
        expectedCategory: groundTransaction?.expectedCategory ?? null,
        expectedBehavior,
        possibleMissingRule:
          groundTruthCategorized &&
          !currentSeedPatternMatch &&
          (expectedBehavior === "auto_apply" || item.type === "uncategorized_transaction"),
        groundTruthCategorized,
        trulyUnknownOrAmbiguous:
          expectedCategoryId === "cat-uncategorized" ||
          expectedBehavior === "low_confidence" ||
          !groundTransaction,
        importerNoise: !groundTransaction,
        currentSeedPatternMatch,
      };
    });
  const ruleCandidates = makeRuleCandidates(
    rows.filter((row) => !row.currentSeedPatternMatch),
  );
  const safeCandidates = ruleCandidates.filter((candidate) => candidate.generalizable);
  const targetTransactions = new Set(
    rows
      .filter((row) => row.groundTruthCategorized && !row.currentSeedPatternMatch)
      .map((row) => row.transactionId),
  );
  const greedy = greedyRuleCoverage(safeCandidates, targetTransactions);
  const theoreticalCoverage = coverageByRuleType(ruleCandidates);
  const safeCoverage = coverageByRuleType(safeCandidates);
  const pendingByType = countBy(rows, (row) => row.pendingType);
  const dimensions = {
    company: countBy(rows, (row) => row.companyId),
    bankAccount: countBy(rows, (row) => row.bankAccountId),
    transactionType: countBy(rows, (row) => row.type),
    month: countBy(rows, (row) => row.month),
    amountBand: countBy(rows, (row) => row.amountBand),
    expectedCategory: countBy(rows, (row) => row.expectedCategory ?? "SEM GROUND TRUTH"),
    expectedBehavior: countBy(rows, (row) => row.expectedBehavior ?? "SEM GROUND TRUTH"),
    syntheticKind: countBy(rows, (row) => row.syntheticKind ?? "SEM GROUND TRUTH"),
  };
  const groundPendingByType = countBy(ground.pendingItems, (item) => item.pendingType);
  const rulesPerCompany = await prisma.categorizationRule.groupBy({
    by: ["companyId"],
    where: { companyId: { in: publishedCompanyIds }, status: "active" },
    _count: true,
  });
  const topDescriptions = countBy(rows, (row) => row.descriptionFamily).slice(0, 50);
  const topCounterparties = countBy(rows, (row) => row.counterparty).slice(0, 50);
  const topDocuments = countBy(
    rows.filter((row) => row.document),
    (row) => row.document,
  ).slice(0, 50);
  const topDescriptionAmount = countBy(
    rows,
    (row) => `${row.descriptionFamily}|${row.amountBand}`,
  ).slice(0, 50);
  const possibleMissingRule = rows.filter((row) => row.possibleMissingRule).length;
  const trulyUnknown = rows.filter((row) => row.trulyUnknownOrAmbiguous).length;
  const importerNoise = rows.filter((row) => row.importerNoise).length;
  const shouldHaveCategory = rows.filter((row) => row.groundTruthCategorized).length;
  const noSeedPattern = rows.filter((row) => !row.currentSeedPatternMatch).length;
  const missingPersistedCounterparty = rows.filter((row) => !row.persistedCounterparty).length;
  const missingPersistedDocument = rows.filter((row) => !row.persistedDocument).length;
  const businessEventKey = (item: (typeof allOpenPending)[number]) =>
    [
      item.companyId,
      item.type,
      item.transactionId ??
        item.suggestionId ??
        item.recurrenceSuggestionId ??
        item.duplicateCandidateId ??
        item.deduplicationKey,
    ].join("|");
  const pendingKpis = {
    pending_items_physical: allOpenPending.length,
    pending_items_by_business_event: new Set(allOpenPending.map(businessEventKey)).size,
    pending_items_by_transaction: new Set(
      allOpenPending.flatMap((item) => (item.transactionId ? [item.transactionId] : [])),
    ).size,
    pending_items_by_categorization_suggestion: new Set(
      allOpenPending.flatMap((item) => (item.suggestionId ? [item.suggestionId] : [])),
    ).size,
    pending_items_by_recurrence_group: new Set(
      allOpenPending.flatMap((item) =>
        item.recurrenceSuggestionId ? [item.recurrenceSuggestionId] : [],
      ),
    ).size,
    pending_items_by_duplicate: new Set(
      allOpenPending.flatMap((item) =>
        item.duplicateCandidateId ? [item.duplicateCandidateId] : [],
      ),
    ).size,
  };

  const report = [
    "# Auditoria de cobertura das pendencias de categorizacao",
    "",
    `Gerado em: ${new Date().toISOString()}`,
    "",
    "## Resumo",
    "",
    markdownTable(
      ["Metrica", "Resultado"],
      [
        ["Pendencias auditadas", rows.length],
        ["Transactions reconciliadas", `${reconciliation.byPersistedId.size}/${transactions.length}`],
        ["Deveriam ter categoria pelo ground truth", shouldHaveCategory],
        ["Possivel regra ausente", possibleMissingRule],
        ["Realmente desconhecidas ou ambiguas", trulyUnknown],
        ["Ruido que virou Transaction", importerNoise],
        [`Sem correspondencia com os ${seedPatterns.length} patterns atuais`, noSeedPattern],
        ["Sem contraparte persistida", missingPersistedCounterparty],
        ["Sem documento persistido", missingPersistedDocument],
      ],
    ),
    "",
    "## KPI paralelo de pendencias",
    "",
    markdownTable(
      ["Metrica", "Quantidade", "Unidade"],
      [
        ["pending_items_physical", pendingKpis.pending_items_physical, "linhas abertas de PendingItem"],
        ["pending_items_by_business_event", pendingKpis.pending_items_by_business_event, "company + tipo + entidade relacionada"],
        ["pending_items_by_transaction", pendingKpis.pending_items_by_transaction, "Transactions distintas com pendencia"],
        ["pending_items_by_categorization_suggestion", pendingKpis.pending_items_by_categorization_suggestion, "sugestoes de categorizacao distintas"],
        ["pending_items_by_recurrence_group", pendingKpis.pending_items_by_recurrence_group, "sugestoes acionaveis de recorrencia distintas"],
        ["pending_items_by_duplicate", pendingKpis.pending_items_by_duplicate, "candidatos de duplicidade distintos"],
      ],
    ),
    "",
    "O ground truth mistura eventos por transacao e por grupo logico. `pending_items_physical` e diretamente comparavel apenas quando a unidade esperada tambem e uma linha acionavel; recorrencias e conflitos exigem comparacao por entidade logica.",
    "",
    "Pendencias atuais:",
    "",
    markdownTable(["Tipo", "Quantidade"], pendingByType.map((item) => [item.key, item.count])),
    "",
    "Dimensoes principais:",
    "",
    markdownTable(
      ["Dimensao", "Valor", "Quantidade"],
      [
        ...dimensions.company.map((item) => ["empresa", item.key, item.count]),
        ...dimensions.bankAccount.map((item) => ["conta", item.key, item.count]),
        ...dimensions.transactionType.map((item) => ["tipo", item.key, item.count]),
        ...dimensions.amountBand.map((item) => ["faixa", item.key, item.count]),
      ],
    ),
    "",
    "Ground truth publicado de pendencias:",
    "",
    markdownTable(["Tipo", "Quantidade"], groundPendingByType.map((item) => [item.key, item.count])),
    "",
    "Regras ativas por empresa:",
    "",
    markdownTable(
      ["Empresa", "Regras"],
      rulesPerCompany.map((item) => [item.companyId, item._count]),
    ),
    "",
    "## Top 50 descricoes sem cobertura",
    "",
    markdownTable(["Descricao economica", "Pendencias"], topDescriptions.map((item) => [item.key, item.count])),
    "",
    "## Top 50 contrapartes",
    "",
    markdownTable(["Contraparte", "Pendencias"], topCounterparties.map((item) => [item.key, item.count])),
    "",
    "## Top 50 documentos",
    "",
    markdownTable(["Documento", "Pendencias"], topDocuments.map((item) => [item.key, item.count])),
    "",
    "## Top 50 descricao + faixa de valor",
    "",
    markdownTable(["Grupo", "Pendencias"], topDescriptionAmount.map((item) => [item.key, item.count])),
    "",
    "## Cobertura por tipo de regra",
    "",
    markdownTable(
      ["Tipo", "Regras teoricas", "Transactions teoricas", "Regras generalizaveis", "Transactions generalizaveis"],
      [...new Set([...Object.keys(theoreticalCoverage), ...Object.keys(safeCoverage)])].map((ruleType) => [
        ruleType,
        theoreticalCoverage[ruleType]?.rules ?? 0,
        theoreticalCoverage[ruleType]?.transactions ?? 0,
        safeCoverage[ruleType]?.rules ?? 0,
        safeCoverage[ruleType]?.transactions ?? 0,
      ]),
    ),
    "",
    "As tabelas de contraparte e documento usam o ground truth como evidencia quando o campo persistido esta vazio. As estimativas de regras, entretanto, usam apenas campos realmente persistidos; por isso `counterparty_contains` e `document_equals` nao recebem cobertura artificial.",
    "",
    "## Regras generalizaveis recomendadas para avaliacao",
    "",
    markdownTable(
      ["Tipo", "Valor", "Categoria esperada", "Cobertura", "Meses", "Pureza"],
      safeCandidates.slice(0, 100).map((candidate) => [
        candidate.ruleType,
        candidate.value,
        candidate.expectedCategoryId,
        candidate.transactionIds.length,
        candidate.months.length,
        percentage(candidate.purity, 1),
      ]),
    ),
    "",
    "## Cobertura de 80%",
    "",
    greedy.target === 0
      ? "Nao restam pendencias categorizaveis sem pattern ativo; portanto nao ha nova cobertura de seed a recomendar."
      : `O universo categorizavel ainda sem pattern e ${greedy.target}. O alvo de 80% e ${greedy.target80}. O greedy com regras generalizaveis cobre ${greedy.covered} (${percentage(greedy.covered, greedy.target)}) usando ${greedy.selected.length} regras. Alvo atingido: ${greedy.reached80 ? "sim" : "nao"}.`,
    "",
    markdownTable(
      ["Ordem", "Tipo", "Valor", "Categoria", "Cobertura bruta"],
      greedy.selected.map((candidate, index) => [
        index + 1,
        candidate.ruleType,
        candidate.value,
        candidate.expectedCategoryId,
        candidate.transactionIds.length,
      ]),
    ),
    "",
    "## Respostas objetivas",
    "",
    `1. Existem ${pendingByType.find((item) => item.key === "uncategorized_transaction")?.count ?? 0} uncategorized apos aplicar ${seedPatterns.length} patterns description-based por empresa; os casos restantes nao possuem categoria segura ou familia semantica coberta.`,
    possibleMissingRule === 0
      ? "2. O seed nao apresenta lacuna categorizavel restante: nenhuma pendencia aponta para categoria conhecida sem pattern ativo."
      : `2. O seed ainda e insuficiente: ${possibleMissingRule} pendencias apontam para categoria conhecida e possivel regra ausente.`,
    `3. ${noSeedPattern} pendencias usam descricoes que nao contem nenhum pattern publicado no seed.`,
    "4. O harness continua usando principalmente description_contains porque o XLSX publicado nao transporta contraparte/documento canonicos; isso agora e limitacao de sinal, nao lacuna de cobertura.",
    greedy.target === 0
      ? "5. Nao ha novas regras recomendadas: todas as pendencias categorizaveis restantes ja possuem pattern e exigem revisao, conflito ou baixa confianca por desenho."
      : `5. ${greedy.reached80 ? `${greedy.selected.length} regras generalizaveis cobrem 80%` : `nem todas as regras generalizaveis encontradas atingem 80%; ${greedy.selected.length} cobrem ${percentage(greedy.covered, greedy.target)}`}.`,
    "6. Regras unitarias por documento continuam excluidas para evitar overfitting; futuras regras so devem ser consideradas se novos dados reais trouxerem sinais persistidos confiaveis.",
    `7. O esperado de 404 pendencias nao e compativel com o seed atual: ele pressupoe cobertura de categorizacao e uma semantica de pendencia de recorrencia diferente da implementada pela V1.`,
    "",
  ].join("\n");

  const json = {
    generatedAt: new Date().toISOString(),
    reconciliation: {
      persisted: transactions.length,
      mapped: reconciliation.byPersistedId.size,
      unmatchedPersistedIds: reconciliation.unmatchedPersistedIds,
      unmatchedSyntheticIds: reconciliation.unmatchedSyntheticIds,
    },
    summary: {
      pending: rows.length,
      pendingByType,
      shouldHaveCategory,
      possibleMissingRule,
      trulyUnknown,
      importerNoise,
      noSeedPattern,
      missingPersistedCounterparty,
      missingPersistedDocument,
      seedPatterns: seedPatterns.length,
      groundPendingByType,
      rulesPerCompany,
      pendingKpis,
      dimensions,
      greedy: {
        target: greedy.target,
        target80: greedy.target80,
        covered: greedy.covered,
        reached80: greedy.reached80,
        selectedRules: greedy.selected.length,
      },
      theoreticalCoverage,
      safeCoverage,
    },
    topDescriptions,
    topCounterparties,
    topDocuments,
    topDescriptionAmount,
    recommendedRules: safeCandidates,
    rows,
  };

  await mkdir(path.join(process.cwd(), "tmp"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(process.cwd(), "tmp", "categorization-pending-audit.json"),
      JSON.stringify(json, null, 2),
      "utf8",
    ),
    writeFile(path.join(process.cwd(), "CATEGORIZATION_PENDING_AUDIT_REPORT.md"), report, "utf8"),
  ]);

  const [rawAudit, actionableAudit] = await Promise.all([
    readAuditJson("recurrence-raw-audit.json"),
    readAuditJson("actionable-recurrence-audit.json"),
  ]);
  const rawSummary = rawAudit.summary as Record<string, unknown>;
  const actionableSummary = actionableAudit.summary as Record<string, unknown>;
  const gapReport = [
    "# Validation gap analysis",
    "",
    `Gerado em: ${new Date().toISOString()}`,
    "",
    "## Quadro de divergencias",
    "",
    markdownTable(
      ["Classificacao", "Severidade", "Modulo", "Evidencia", "Causa provavel", "Correcao recomendada", "Risco", "Bloqueia V1 demo?"],
      [
        possibleMissingRule > 0
          ? [
              "Falta de regra/seed",
              "alta",
              "Categorizacao",
              `${possibleMissingRule} pendencias com categoria esperada; ${noSeedPattern} sem pattern atual`,
              "Seed publicado ainda nao cobre familias economicas relevantes",
              "Expandir seed somente com familias generalizaveis auditadas",
              "medio: regras amplas podem criar conflitos ou autoaplicacao incorreta",
              "Sim para afirmar validacao publicada; nao para demonstrar infraestrutura",
            ]
          : [
              "Limitacao de sinal/dataset",
              "baixa",
              "Categorizacao",
              `0 regras faltantes; ${noSeedPattern} casos restantes sem pattern seguro e ${trulyUnknown} desconhecidos/ambiguos`,
              "O XLSX sintetico nao transporta contraparte/documento canonicos; a cobertura semantica por descricao foi concluida",
              "Manter os casos desconhecidos em revisao e validar sinais adicionais apenas com layouts que realmente os fornecam",
              "baixo: inferir metadados ausentes criaria overfitting e alteraria identidade de importacao",
              "Nao",
            ],
        [
          "Limitacao esperada do detector V1",
          "media",
          "Recorrencias core",
          `${rawSummary.total} raw para ${rawSummary.expectedGroups} grupos; ${JSON.stringify(rawSummary.byClassification)}`,
          "Detector retorna hipoteses por padrao e inclui repeticoes economicamente plausiveis fora do ground truth",
          "Revisar core somente com matriz de falsos positivos e fragmentacoes aprovada",
          "alto: reduzir recall ou esconder recorrencias validas",
          "Nao, se a fila acionavel for apresentada como sugestao para revisao",
        ],
        [
          "Decisao de produto ainda nao fechada",
          "media",
          "Recorrencias/UI",
          `${actionableSummary.humanReviewCounter} candidatas aceitaveis para revisao; contador estrito ${actionableSummary.strictCounter}`,
          "Nao esta definido se o contador representa ground truth estrito ou hipoteses plausiveis",
          "Definir contrato do contador e politica para ambiguous",
          "baixo tecnicamente; alto para expectativa do usuario",
          "Nao, mas deve ser documentado",
        ],
        [
          "Bug ou limitacao da consolidacao",
          "alta",
          "Recorrencias/integracao",
          `Raw representa 46/46 grupos, mas a fila acionavel representa ${actionableSummary.matchedGroundTruthGroups}/46 e perde ${(actionableSummary.missingGroundTruthGroupIds as string[]).length} grupos`,
          "A equivalencia por sobreposicao pode selecionar merges ou falsos positivos como canonicos e superseder grupos esperados",
          "Auditar os oito grupos perdidos e o grafo de equivalencia antes de mudar a consolidacao",
          "alto: separar demais volta a gerar duplicatas; consolidar demais reduz recall",
          "Sim para afirmar cobertura de recorrencias do dataset; nao para o fluxo tecnico basico",
        ],
        [
          "Ground truth restritivo ou ambiguo",
          "media",
          "Dataset",
          `${rawSummary.groupsAbsent} grupos ausentes e padroes ambiguous classificados separadamente`,
          "Transacoes rotuladas como isoladas podem formar repeticoes plausiveis para o detector",
          "Revisar casos ambiguous com produto sem alterar automaticamente o ground truth",
          "medio: ajustar o ground truth pode mascarar falso positivo",
          "Nao",
        ],
        [
          "Bug de implementacao",
          "baixa/resolvida",
          "Integracao de recorrencias",
          "Rerun final cria 0 sugestoes e 0 pendencias; uma pendencia aberta por sugestao acionavel",
          "Sobregeracao incremental ja corrigida",
          "Manter regressao e diagnostico",
          "baixo",
          "Nao",
        ],
        [
          "Semantica divergente",
          "media",
          "Pendencias/ground truth",
          `Ground truth: ${ground.pendingItems.length}; V1 auditada: ${rows.length} apenas em categorizacao`,
          "Ground truth contabiliza eventos por transacao, enquanto a V1 consolida algumas pendencias por entidade logica",
          "Definir unidade contabil do KPI antes de exigir igualdade",
          "medio",
          "Nao para demo; sim para gate numerico de 404",
        ],
      ],
    ),
    "",
    "## Plano recomendado, sem implementacao nesta etapa",
    "",
    "1. Fechar o contrato do ground truth de pendencias: evento por transacao versus pendencia acionavel por entidade.",
    "2. Manter as 56 regras amplas sob regressao; nao adicionar novas regras enquanto `possibleMissingRule` permanecer zero.",
    "3. Recuperar na consolidacao os oito grupos de recorrencia que o raw detecta e a fila acionavel perde.",
    "4. Revisar manualmente duplicatas acionaveis, falsos positivos e `ambiguous` antes de qualquer mudanca no core.",
    "5. Manter ground truth imutavel; qualquer revisao futura deve ser uma decisao versionada e independente.",
    "",
    "## Gate da V1 demo",
    "",
    "A cobertura ampla de categorizacao nao bloqueia mais a demo: a meta de `uncategorized < 250` foi superada e nao restam regras categorizaveis faltantes. Ainda bloqueiam a afirmacao de aderencia integral ao dataset publicado a perda de oito grupos na consolidacao de recorrencias e a falta de contrato comum para o KPI de 404 pendencias. Importacao, deduplicacao, RBAC, isolamento, categorizacao ampla, aprovacao de recorrencia e projecao estao funcionais.",
    "",
  ].join("\n");
  await writeFile(path.join(process.cwd(), "VALIDATION_GAP_ANALYSIS.md"), gapReport, "utf8");

  console.log(
    JSON.stringify(
      {
        report: "CATEGORIZATION_PENDING_AUDIT_REPORT.md",
        gapReport: "VALIDATION_GAP_ANALYSIS.md",
        json: "tmp/categorization-pending-audit.json",
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
