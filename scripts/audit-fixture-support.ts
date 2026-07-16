import type { Prisma, RecurrenceSuggestionStatus, Transaction } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { transactionToRecurrenceInput } from "../src/modules/recurrences/adapters/transactionToRecurrenceInput";
import { detectRecurrences } from "../src/modules/recurrences/core/service/recurrenceDetectionService.ts";
import type { RecurrenceSuggestion as CoreRecurrenceSuggestion } from "../src/modules/recurrences/core/types.ts";

export const datasetRoot = path.resolve(
  process.cwd(),
  "..",
  "gerador de testes",
  "zelo-financial-fixture-generator",
  "output",
  "seed-v1",
);

export const publishedCompanyIds = [1, 2, 3, 4, 5].map(
  (value) => `published-company-${String(value).padStart(3, "0")}`,
);

export interface GroundTransaction {
  id: string;
  companyId: string;
  bankAccountId: string;
  sourceFileName: string;
  statementMonth: number;
  statementYear: number;
  date: string;
  description: string;
  normalizedDescription: string;
  amount: string;
  amountCents: number;
  type: "income" | "expense";
  counterpartyName?: string;
  documentNumber?: string;
  syntheticKind: string;
  expectedCategoryId?: string;
  expectedCategory?: string;
  expectedCategorizationBehavior?: string;
  expectedDuplicateBehavior?: string;
  expectedImportBehavior: string;
  expectedRecurrenceGroupId?: string;
  expectedRecurrenceType?: string;
  expectedFrequency?: string;
}

export interface ExpectedRecurrenceGroup {
  id: string;
  companyId: string;
  bankAccountId: string;
  counterpartyName: string;
  descriptionBase: string;
  type: string;
  frequency: string;
  transactions: Array<{ syntheticTransactionId: string; date: string; amount: string }>;
}

export interface GroundCategory {
  id: string;
  name: string;
  type: "income" | "expense" | "neutral";
  group: string;
}

export interface GroundRule {
  id: string;
  categoryId: string;
  pattern: string;
  conceptualBehavior: string;
}

export interface GroundPendingItem {
  companyId: string;
  syntheticTransactionId: string;
  pendingType: string;
}

export interface GroundTruth {
  transactions: GroundTransaction[];
  importedTransactions: GroundTransaction[];
  recurrenceGroups: ExpectedRecurrenceGroup[];
  categories: GroundCategory[];
  rules: GroundRule[];
  pendingItems: GroundPendingItem[];
}

export interface ReconciliationResult {
  byPersistedId: Map<string, GroundTransaction>;
  bySyntheticId: Map<string, Transaction>;
  unmatchedPersistedIds: string[];
  unmatchedSyntheticIds: string[];
  ambiguousPersistedIds: string[];
}

export type RawClassification =
  | "exact_match"
  | "partial_match"
  | "merge_error"
  | "false_positive"
  | "ambiguous"
  | "duplicate_variant";

export interface CandidateInput {
  id: string;
  companyId: string;
  type: string;
  frequency: string;
  recurrenceType: string;
  patternKind?: string | null;
  normalizedDescription: string;
  representativeDescription: string;
  transactionIds: string[];
  confidenceScore: number;
  status?: RecurrenceSuggestionStatus;
}

export interface CandidateAudit {
  id: string;
  companyId: string;
  type: string;
  frequency: string;
  recurrenceType: string;
  patternKind: string | null;
  normalizedDescription: string;
  representativeDescription: string;
  confidenceScore: number;
  status?: RecurrenceSuggestionStatus;
  transactionCount: number;
  mappedTransactionCount: number;
  classification: RawClassification;
  bestGroundTruthGroupId: string | null;
  bestIntersection: number;
  precision: number;
  recall: number;
  f1: number;
  frequencyCompatible: boolean;
  matchedGroundTruthGroups: Array<{ id: string; intersection: number }>;
  syntheticKinds: Record<string, number>;
  transactionIds: string[];
  syntheticTransactionIds: string[];
  rationale: string;
}

export interface RecurrenceAuditSummary {
  total: number;
  byCompany: Record<string, number>;
  byType: Record<string, number>;
  byPatternKind: Record<string, number>;
  byRecurrenceType: Record<string, number>;
  byClassification: Record<string, number>;
  expectedGroups: number;
  groupsDetected: number;
  groupsExact: number;
  groupsPartial: number;
  groupsFragmented: number;
  groupsAbsent: number;
  detectedGroupIds: string[];
  exactGroupIds: string[];
  partialGroupIds: string[];
  fragmentedGroupIds: string[];
  absentGroupIds: string[];
}

export interface RecurrenceAuditResult {
  generatedAt: string;
  reconciliation: {
    persisted: number;
    mapped: number;
    unmatchedPersistedIds: string[];
    unmatchedSyntheticIds: string[];
    ambiguousPersistedIds: string[];
  };
  summary: RecurrenceAuditSummary;
  candidates: CandidateAudit[];
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(datasetRoot, relativePath), "utf8")) as T;
}

export async function loadGroundTruth(): Promise<GroundTruth> {
  const [transactions, recurrences, categories, rules, pending] = await Promise.all([
    readJson<GroundTransaction[]>("canonical/transactions.json"),
    readJson<{ groups: ExpectedRecurrenceGroup[] }>("ground-truth/expected-recurrences.json"),
    readJson<GroundCategory[]>("categories.json"),
    readJson<GroundRule[]>("categorization-rules.json"),
    readJson<{ items: GroundPendingItem[] }>("ground-truth/expected-pending-items.json"),
  ]);
  return {
    transactions,
    importedTransactions: transactions.filter((item) => item.expectedImportBehavior === "imported"),
    recurrenceGroups: recurrences.groups,
    categories,
    rules,
    pendingItems: pending.items,
  };
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function syntheticCompanyId(publishedId: string): string {
  return publishedId.replace(/^published-/, "");
}

export function publishedCompanyId(syntheticId: string): string {
  return `published-${syntheticId}`;
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function transactionScore(transaction: Transaction, ground: GroundTransaction): number {
  if (syntheticCompanyId(transaction.companyId) !== ground.companyId) return -1;
  if (isoDate(transaction.date) !== ground.date) return -1;
  if (Math.round(Number(transaction.amount) * 100) !== ground.amountCents) return -1;
  let score = 1;
  if (normalizeText(transaction.description) === normalizeText(ground.description)) score += 10;
  if (
    ground.documentNumber &&
    normalizeText(transaction.documentNumber) === normalizeText(ground.documentNumber)
  ) {
    score += 5;
  }
  if (
    ground.counterpartyName &&
    normalizeText(transaction.counterpartyName) === normalizeText(ground.counterpartyName)
  ) {
    score += 3;
  }
  return score;
}

export function reconcileTransactions(
  transactions: Transaction[],
  groundTransactions: GroundTransaction[],
): ReconciliationResult {
  const candidatesByBase = new Map<string, GroundTransaction[]>();
  for (const ground of groundTransactions) {
    const key = [ground.companyId, ground.date, ground.amountCents].join("|");
    candidatesByBase.set(key, [...(candidatesByBase.get(key) ?? []), ground]);
  }
  const usedGroundRows = new Set<GroundTransaction>();
  const usedPersistedIds = new Set<string>();
  const byPersistedId = new Map<string, GroundTransaction>();
  const bySyntheticId = new Map<string, Transaction>();
  const ambiguousPersistedIds: string[] = [];

  const baseKey = (transaction: Transaction) =>
    [
      syntheticCompanyId(transaction.companyId),
      isoDate(transaction.date),
      Math.round(Number(transaction.amount) * 100),
    ].join("|");
  const assign = (transaction: Transaction, ground: GroundTransaction) => {
    usedGroundRows.add(ground);
    usedPersistedIds.add(transaction.id);
    byPersistedId.set(transaction.id, ground);
    const syntheticKey = bySyntheticId.has(ground.id)
      ? `${ground.id}#${[...bySyntheticId.keys()].filter((key) => key.startsWith(ground.id)).length + 1}`
      : ground.id;
    bySyntheticId.set(syntheticKey, transaction);
  };
  const transactionsByBase = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    transactionsByBase.set(baseKey(transaction), [
      ...(transactionsByBase.get(baseKey(transaction)) ?? []),
      transaction,
    ]);
  }
  for (const [key, groupedTransactions] of transactionsByBase) {
    const groupedGround = candidatesByBase.get(key) ?? [];
    const pairs = groupedTransactions
      .flatMap((transaction) =>
        groupedGround.map((ground) => ({
          transaction,
          ground,
          score: transactionScore(transaction, ground),
        })),
      )
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.transaction.id.localeCompare(right.transaction.id) ||
          left.ground.id.localeCompare(right.ground.id),
      );
    for (const transaction of groupedTransactions) {
      const scores = pairs
        .filter((pair) => pair.transaction.id === transaction.id)
        .map((pair) => pair.score)
        .sort((left, right) => right - left);
      if (scores.length > 1 && scores[0] === scores[1]) ambiguousPersistedIds.push(transaction.id);
    }
    for (const pair of pairs) {
      if (usedPersistedIds.has(pair.transaction.id) || usedGroundRows.has(pair.ground)) continue;
      assign(pair.transaction, pair.ground);
    }
  }

  return {
    byPersistedId,
    bySyntheticId,
    unmatchedPersistedIds: transactions
      .filter((transaction) => !byPersistedId.has(transaction.id))
      .map((transaction) => transaction.id),
    ambiguousPersistedIds,
    unmatchedSyntheticIds: groundTransactions
      .filter((ground) => !usedGroundRows.has(ground))
      .map((ground) => ground.id),
  };
}

export async function loadPublishedTransactions(): Promise<Transaction[]> {
  return prisma.transaction.findMany({
    where: { companyId: { in: publishedCompanyIds } },
    orderBy: [{ companyId: "asc" }, { date: "asc" }, { id: "asc" }],
  });
}

export async function detectPublishedRaw(
  transactions: Transaction[],
): Promise<CoreRecurrenceSuggestion[]> {
  const results: CoreRecurrenceSuggestion[] = [];
  for (const companyId of publishedCompanyIds) {
    results.push(
      ...detectRecurrences(
        transactions
          .filter((transaction) => transaction.companyId === companyId)
          .map(transactionToRecurrenceInput),
      ),
    );
  }
  return results;
}

export function coreCandidate(suggestion: CoreRecurrenceSuggestion): CandidateInput {
  return {
    id: suggestion.id,
    companyId: suggestion.companyId,
    type: suggestion.type,
    frequency: suggestion.frequency,
    recurrenceType: suggestion.recurrenceType,
    patternKind: suggestion.patternKind ?? null,
    normalizedDescription: suggestion.normalizedDescription,
    representativeDescription: suggestion.representativeDescription,
    transactionIds: suggestion.transactionIds,
    confidenceScore: suggestion.confidenceScore,
  };
}

export type PersistedSuggestionForAudit = Prisma.RecurrenceSuggestionGetPayload<{
  include: { transactions: { select: { transactionId: true } } };
}>;

export function persistedCandidate(suggestion: PersistedSuggestionForAudit): CandidateInput {
  return {
    id: suggestion.id,
    companyId: suggestion.companyId,
    type: suggestion.type,
    frequency: suggestion.frequency,
    recurrenceType: suggestion.recurrenceType,
    patternKind: suggestion.patternKind,
    normalizedDescription: suggestion.normalizedDescription,
    representativeDescription: suggestion.representativeDescription,
    transactionIds: suggestion.transactions.map((item) => item.transactionId),
    confidenceScore: suggestion.confidenceScore,
    status: suggestion.status,
  };
}

function countBy(values: string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)]
      .map((value) => [value, values.filter((item) => item === value).length] as const)
      .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0])),
  );
}

function overlapCoefficient(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let intersection = 0;
  for (const id of leftSet) if (rightSet.has(id)) intersection += 1;
  return intersection / Math.min(leftSet.size, rightSet.size);
}

function frequencyCompatible(candidate: CandidateInput, group: ExpectedRecurrenceGroup | undefined): boolean {
  if (!group) return false;
  if (candidate.frequency === group.frequency) return true;
  return group.type === "frequent_supplier" && candidate.frequency === "biweekly";
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function auditRecurrenceCandidates(params: {
  candidates: CandidateInput[];
  reconciliation: ReconciliationResult;
  ground: GroundTruth;
  persistedTransactionCount: number;
}): RecurrenceAuditResult {
  const groupsById = new Map(params.ground.recurrenceGroups.map((group) => [group.id, group]));
  const groupTransactionSets = new Map(
    params.ground.recurrenceGroups.map((group) => [
      group.id,
      new Set(group.transactions.map((item) => item.syntheticTransactionId)),
    ]),
  );

  const audited: CandidateAudit[] = params.candidates.map((candidate) => {
    const mapped = candidate.transactionIds
      .map((id) => params.reconciliation.byPersistedId.get(id))
      .filter((item): item is GroundTransaction => Boolean(item));
    const groupCounts = new Map<string, number>();
    for (const transaction of mapped) {
      if (!transaction.expectedRecurrenceGroupId) continue;
      groupCounts.set(
        transaction.expectedRecurrenceGroupId,
        (groupCounts.get(transaction.expectedRecurrenceGroupId) ?? 0) + 1,
      );
    }
    const matchedGroups = [...groupCounts.entries()]
      .map(([id, intersection]) => ({ id, intersection }))
      .sort((left, right) => right.intersection - left.intersection || left.id.localeCompare(right.id));
    const best = matchedGroups[0];
    const expectedSize = best ? (groupTransactionSets.get(best.id)?.size ?? 0) : 0;
    const precision = best ? best.intersection / Math.max(mapped.length, 1) : 0;
    const recall = best ? best.intersection / Math.max(expectedSize, 1) : 0;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const significantGroups = matchedGroups.filter(
      (item) => item.intersection >= 2 && item.intersection / Math.max(mapped.length, 1) >= 0.15,
    );
    const kinds = countBy(mapped.map((item) => item.syntheticKind));
    const months = new Set(mapped.map((item) => `${item.statementYear}-${item.statementMonth}`));
    const counterparties = mapped.map((item) => normalizeText(item.counterpartyName)).filter(Boolean);
    const dominantCounterparty = Math.max(0, ...Object.values(countBy(counterparties))) / Math.max(mapped.length, 1);
    const transferRatio =
      mapped.filter((item) => /transfer/i.test(item.syntheticKind)).length / Math.max(mapped.length, 1);
    const compatible = frequencyCompatible(candidate, best ? groupsById.get(best.id) : undefined);
    let classification: RawClassification;
    let rationale: string;
    if (significantGroups.length >= 2) {
      classification = "merge_error";
      rationale = `Mistura ${significantGroups.length} grupos esperados com intersecoes relevantes.`;
    } else if (best && best.intersection >= 2) {
      if (precision >= 0.9 && recall >= 0.8 && compatible) {
        classification = "exact_match";
        rationale = "Alta precisao e cobertura do grupo esperado, com frequencia compativel.";
      } else {
        classification = "partial_match";
        rationale = "Ha grupo dominante, mas a cobertura, precisao ou frequencia nao fecha correspondencia exata.";
      }
    } else if (transferRatio >= 0.5) {
      classification = "false_positive";
      rationale = "Padrao formado majoritariamente por transferencias, explicitamente nao recorrentes no ground truth.";
    } else if (months.size >= 4 && dominantCounterparty >= 0.75) {
      classification = "ambiguous";
      rationale = "Padrao economico repetido e plausivel, mas sem grupo publicado no ground truth.";
    } else {
      classification = "false_positive";
      rationale = "Sem grupo esperado dominante e sem identidade economica repetida suficiente.";
    }
    return {
      id: candidate.id,
      companyId: candidate.companyId,
      type: candidate.type,
      frequency: candidate.frequency,
      recurrenceType: candidate.recurrenceType,
      patternKind: candidate.patternKind ?? null,
      normalizedDescription: candidate.normalizedDescription,
      representativeDescription: candidate.representativeDescription,
      confidenceScore: candidate.confidenceScore,
      ...(candidate.status ? { status: candidate.status } : {}),
      transactionCount: candidate.transactionIds.length,
      mappedTransactionCount: mapped.length,
      classification,
      bestGroundTruthGroupId: best?.id ?? null,
      bestIntersection: best?.intersection ?? 0,
      precision: round(precision),
      recall: round(recall),
      f1: round(f1),
      frequencyCompatible: compatible,
      matchedGroundTruthGroups: matchedGroups,
      syntheticKinds: kinds,
      transactionIds: candidate.transactionIds,
      syntheticTransactionIds: mapped.map((item) => item.id),
      rationale,
    };
  });

  const byBestGroup = new Map<string, CandidateAudit[]>();
  for (const item of audited) {
    if (!item.bestGroundTruthGroupId || item.classification === "merge_error") continue;
    byBestGroup.set(item.bestGroundTruthGroupId, [
      ...(byBestGroup.get(item.bestGroundTruthGroupId) ?? []),
      item,
    ]);
  }
  for (const rows of byBestGroup.values()) {
    rows.sort((left, right) => right.f1 - left.f1 || right.confidenceScore - left.confidenceScore);
    const canonical: CandidateAudit[] = [];
    for (const row of rows) {
      const duplicate = canonical.some(
        (existing) =>
          overlapCoefficient(row.syntheticTransactionIds, existing.syntheticTransactionIds) > 0.7,
      );
      if (duplicate) {
        row.classification = "duplicate_variant";
        row.rationale = "Variacao redundante com mais de 70% de sobreposicao sobre candidato melhor do mesmo grupo.";
      } else {
        canonical.push(row);
      }
    }
  }

  const exactGroupIds = params.ground.recurrenceGroups
    .filter((group) =>
      audited.some(
        (item) => item.bestGroundTruthGroupId === group.id && item.classification === "exact_match",
      ),
    )
    .map((group) => group.id);
  const detectedGroupIds = params.ground.recurrenceGroups
    .filter((group) =>
      audited.some(
        (item) =>
          item.bestGroundTruthGroupId === group.id &&
          (item.classification === "exact_match" || item.classification === "partial_match"),
      ),
    )
    .map((group) => group.id);
  const partialGroupIds = detectedGroupIds.filter((id) => !exactGroupIds.includes(id));
  const fragmentedGroupIds = detectedGroupIds.filter(
    (id) =>
      audited.filter(
        (item) =>
          item.bestGroundTruthGroupId === id &&
          (item.classification === "exact_match" || item.classification === "partial_match"),
      ).length > 1,
  );
  const absentGroupIds = params.ground.recurrenceGroups
    .map((group) => group.id)
    .filter((id) => !detectedGroupIds.includes(id));

  return {
    generatedAt: new Date().toISOString(),
    reconciliation: {
      persisted: params.persistedTransactionCount,
      mapped: params.reconciliation.byPersistedId.size,
      unmatchedPersistedIds: params.reconciliation.unmatchedPersistedIds,
      unmatchedSyntheticIds: params.reconciliation.unmatchedSyntheticIds,
      ambiguousPersistedIds: params.reconciliation.ambiguousPersistedIds,
    },
    summary: {
      total: audited.length,
      byCompany: countBy(audited.map((item) => item.companyId)),
      byType: countBy(audited.map((item) => item.type)),
      byPatternKind: countBy(audited.map((item) => item.patternKind ?? "null")),
      byRecurrenceType: countBy(audited.map((item) => item.recurrenceType)),
      byClassification: countBy(audited.map((item) => item.classification)),
      expectedGroups: params.ground.recurrenceGroups.length,
      groupsDetected: detectedGroupIds.length,
      groupsExact: exactGroupIds.length,
      groupsPartial: partialGroupIds.length,
      groupsFragmented: fragmentedGroupIds.length,
      groupsAbsent: absentGroupIds.length,
      detectedGroupIds,
      exactGroupIds,
      partialGroupIds,
      fragmentedGroupIds,
      absentGroupIds,
    },
    candidates: audited,
  };
}

export function markdownTable(headers: string[], rows: Array<Array<string | number>>): string {
  const safe = (value: string | number) => String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return [
    `| ${headers.map(safe).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(safe).join(" | ")} |`),
  ].join("\n");
}

export function percentage(value: number, total: number): string {
  return total === 0 ? "0%" : `${((value / total) * 100).toFixed(1)}%`;
}

export { prisma };
