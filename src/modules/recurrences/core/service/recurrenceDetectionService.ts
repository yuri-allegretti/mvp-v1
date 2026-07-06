import { analyzeAmountStability } from "../amount/amountStabilityAnalyzer.ts";
import { createCandidateBlocks } from "../blocking/candidateBlocker.ts";
import {
  DEFAULT_THRESHOLDS,
  mergeThresholds,
  type DetectionThresholdOverrides
} from "../config/defaultThresholds.ts";
import {
  clusterSimilarTransactions,
  hasDistinctiveMerchantIdentity
} from "../clustering/transactionClusterer.ts";
import { removeDuplicateTransactions } from "../duplicates/duplicateFilter.ts";
import { generateEconomicIdentityCandidates } from "../identity/economicCandidateGenerator.ts";
import { getDistinctiveTokens } from "../identity/economicIdentity.ts";
import { normalizeTransactions } from "../normalization/transactionNormalizer.ts";
import { detectBestRecurrencePattern } from "../patterns/recurrencePatternDetector.ts";
import { detectPeriodicity } from "../periodicity/periodicityDetector.ts";
import { calculatePatternRecurrenceScore } from "../scoring/patternRecurrenceScorer.ts";
import { analyzeCategoryConsistency, calculateRecurrenceScore } from "../scoring/recurrenceScorer.ts";
import { analyzeGroupTextSimilarity, compareTransactionsText } from "../similarity/textSimilarity.ts";
import type { NormalizedTransaction, RecurrenceSuggestion, Transaction } from "../types.ts";
import { addMonthsClamped, dayOfMonth, parseIsoDate } from "../utils/dateUtils.ts";

export interface DetectionOptions {
  thresholds?: DetectionThresholdOverrides;
}

export function detectRecurrences(
  transactions: Transaction[],
  options: DetectionOptions = {}
): RecurrenceSuggestion[] {
  const thresholds = mergeThresholds(options.thresholds);
  const normalized = normalizeTransactions(transactions, thresholds);
  const clean = removeDuplicateTransactions(normalized);
  const blocks = createCandidateBlocks(clean, thresholds);
  const rawGroups = blocks.flatMap((block) => clusterSimilarTransactions(block.transactions, thresholds));
  const groups = mergeOverlappingGroups(rawGroups, clean)
    .flatMap(splitByExplicitIdentity)
    .map((group) => removeLowCoherenceOutliers(group, thresholds))
    .map((group) => retainDominantMonthlyTrack(group, thresholds))
    .filter((group) => group.length >= 2);
  const suggestions: RecurrenceSuggestion[] = [];

  for (const group of groups) {
    const sortedGroup = [...group].sort((left, right) => left.date.localeCompare(right.date));
    const periodicity = detectPeriodicity(sortedGroup, thresholds);
    if (periodicity.score < thresholds.minimumPeriodicityScoreForSuggestion) {
      continue;
    }
    if (hasMultipleOccurrencesInMonth(sortedGroup) && !extractInstallmentCount(sortedGroup)) {
      continue;
    }
    if (hasContradictoryMerchantContext(sortedGroup, clean, periodicity, thresholds)) {
      continue;
    }

    const amountStability = analyzeAmountStability(sortedGroup);
    const textSimilarity = analyzeGroupTextSimilarity(sortedGroup);
    if (
      amountStability.amountVariationPercent > 100 &&
      textSimilarity.averageScore < thresholds.weakTextSimilarityThreshold
    ) {
      continue;
    }

    const categoryConsistency = analyzeCategoryConsistency(sortedGroup);
    const score = calculateRecurrenceScore({
      periodicity,
      textSimilarity,
      amountStability,
      categoryConsistency,
      occurrenceCount: sortedGroup.length
    }, thresholds);

    if (score.confidenceScore < thresholds.minimumSuggestionScore) {
      continue;
    }

    const installmentCount = extractInstallmentCount(sortedGroup);
    const representative = chooseRepresentativeTransaction(sortedGroup);
    const transactionIds = sortedGroup.map((transaction) => transaction.id);
    const variableRecurrenceReasons = buildVariableRecurrenceReasons(
      amountStability,
      periodicity,
      textSimilarity
    );

    suggestions.push({
      id: `rec_${representative.companyId}_${stableHash(transactionIds.join("|"))}`,
      companyId: representative.companyId,
      type: representative.type,
      categoryId: categoryConsistency.categoryId,
      representativeDescription: representative.description,
      normalizedDescription: representative.normalizedDescription,
      transactionIds,
      frequency: periodicity.frequency,
      recurrenceType: amountStability.recurrenceType,
      averageAmount: amountStability.averageAmount,
      estimatedNextAmount: amountStability.estimatedNextAmount,
      amountVariationPercent: amountStability.amountVariationPercent,
      expectedNextDate: periodicity.expectedNextDate,
      confidenceScore: score.confidenceScore,
      status: "pending",
      startDate: sortedGroup[0]?.date ?? "",
      endDate: installmentCount ? addMonthsClamped(sortedGroup[0]?.date ?? "", installmentCount - 1) : undefined,
      installmentCount,
      evidence: {
        textSimilarityScore: score.textSimilarityScore,
        periodicityScore: score.periodicityScore,
        amountStabilityScore: score.amountStabilityScore,
        categoryScore: score.categoryScore,
        occurrenceScore: score.occurrenceScore,
        reasons: [
          ...score.reasons,
          ...variableRecurrenceReasons,
          ...(installmentCount ? [`parcelamento detectado: ${installmentCount} parcelas`] : [])
        ]
      }
    });
  }

  const economicCandidates = generateEconomicIdentityCandidates(clean);
  for (const candidate of economicCandidates) {
    let sortedGroup = (candidate.source === "income_track"
      ? [...candidate.transactions]
      : removeLowCoherenceOutliers(candidate.transactions, thresholds))
      .sort((left, right) => left.date.localeCompare(right.date));
    if (sortedGroup.length < 3 || hasCompetingEconomicCores(sortedGroup)) continue;

    let amountStability = analyzeAmountStability(sortedGroup);
    let pattern = detectBestRecurrencePattern(sortedGroup, amountStability, thresholds);
    if (!pattern) continue;
    if (pattern.kind === "weekly_recurring" || pattern.kind === "biweekly_recurring") {
      const cadenceDays = pattern.kind === "weekly_recurring" ? 7 : 14;
      const cadenceTrack = retainDominantCadenceTrack(sortedGroup, cadenceDays);
      if (cadenceTrack.length >= 4 && cadenceTrack.length < sortedGroup.length) {
        sortedGroup = cadenceTrack;
        amountStability = analyzeAmountStability(sortedGroup);
        pattern = detectBestRecurrencePattern(sortedGroup, amountStability, thresholds);
        if (!pattern) continue;
      }
    }
    if (pattern.kind !== "installment") {
      const isMonthlyPattern = pattern.periodicity.frequency === "monthly";
      if (isMonthlyPattern && sortedGroup.length < 4) continue;
      if (
        !isMonthlyPattern &&
        pattern.kind !== "weekly_recurring" &&
        pattern.kind !== "biweekly_recurring" &&
        sortedGroup.length < 6
      ) {
        continue;
      }
      if (isMonthlyPattern && hasMultipleOccurrencesInMonth(sortedGroup)) continue;
      if (isMonthlyPattern && hasOnlyEpisodicDescriptions(sortedGroup)) continue;
      if (
        candidate.identityScore <= 0.72 &&
        normalizedDescriptionDiversity(sortedGroup) > 0.6
      ) {
        continue;
      }
      if (
        candidate.identityScore <= 0.72 &&
        rawDescriptionContextDiversity(sortedGroup) > 0.75
      ) {
        continue;
      }
      if (
        candidate.identityScore <= 0.72 &&
        hasSingleCoreContamination(sortedGroup, candidate.key)
      ) {
        continue;
      }
      if (
        candidate.identityScore < 0.95 &&
        normalizedDescriptionDiversity(sortedGroup) <= 0.25 &&
        rawDescriptionContextDiversity(sortedGroup) > 0.6
      ) {
        continue;
      }
    }
    if (
      pattern.periodicity.frequency === "monthly" &&
      hasContradictoryMerchantContext(sortedGroup, clean, pattern.periodicity, thresholds)
    ) {
      continue;
    }

    const categoryConsistency = analyzeCategoryConsistency(sortedGroup);
    const score = calculatePatternRecurrenceScore({
      kind: pattern.kind,
      patternScore: pattern.patternScore,
      identityScore: candidate.identityScore,
      amountStability,
      categoryConsistency,
      occurrenceCount: sortedGroup.length,
      reasons: [candidate.identityReason, ...pattern.periodicity.reasons, ...pattern.reasons]
    });
    if (score.confidenceScore < thresholds.minimumSuggestionScore) continue;

    const representative = chooseRepresentativeTransaction(sortedGroup);
    const transactionIds = sortedGroup.map((transaction) => transaction.id);
    const installmentCount = extractInstallmentCount(sortedGroup);
    suggestions.push({
      id: `rec_${representative.companyId}_${stableHash(transactionIds.join("|"))}`,
      companyId: representative.companyId,
      type: representative.type,
      categoryId: categoryConsistency.categoryId,
      representativeDescription: representative.description,
      normalizedDescription: representative.normalizedDescription,
      transactionIds,
      frequency: pattern.periodicity.frequency,
      recurrenceType: amountStability.recurrenceType,
      patternKind: pattern.kind,
      averageAmount: amountStability.averageAmount,
      estimatedNextAmount: amountStability.estimatedNextAmount,
      amountVariationPercent: amountStability.amountVariationPercent,
      expectedNextDate: pattern.periodicity.expectedNextDate,
      confidenceScore: score.confidenceScore,
      status: "pending",
      startDate: sortedGroup[0]?.date ?? "",
      endDate: installmentCount ? addMonthsClamped(sortedGroup[0]?.date ?? "", installmentCount - 1) : undefined,
      installmentCount,
      evidence: {
        textSimilarityScore: score.textSimilarityScore,
        periodicityScore: score.periodicityScore,
        amountStabilityScore: score.amountStabilityScore,
        categoryScore: score.categoryScore,
        occurrenceScore: score.occurrenceScore,
        reasons: score.reasons
      }
    });
  }

  return deduplicateSuggestions(suggestions)
    .sort((left, right) => right.confidenceScore - left.confidenceScore);
}

function hasCompetingEconomicCores(group: NormalizedTransaction[]): boolean {
  if (group.length < 4) return false;
  const tokenMembership = new Map<string, NormalizedTransaction[]>();
  for (const transaction of group) {
    for (const token of getDistinctiveTokens(transaction)) {
      const members = tokenMembership.get(token) ?? [];
      members.push(transaction);
      tokenMembership.set(token, members);
    }
  }

  const secondaryCores = [...tokenMembership.entries()]
    .filter(([, members]) => members.length >= 2 && members.length <= group.length * 0.7);
  for (let leftIndex = 0; leftIndex < secondaryCores.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < secondaryCores.length; rightIndex += 1) {
      const left = secondaryCores[leftIndex]?.[1] ?? [];
      const right = secondaryCores[rightIndex]?.[1] ?? [];
      if (left.some((transaction) => right.some((candidate) => candidate.id === transaction.id))) continue;
      if (left.length + right.length < group.length * 0.7) continue;

      const leftAmounts = left.map((transaction) => transaction.absoluteAmount);
      const rightAmounts = right.map((transaction) => transaction.absoluteAmount);
      const amountSeparation = relativeAmountDifference(average(leftAmounts), average(rightAmounts));
      const leftDays = left.map((transaction) => dayOfMonth(transaction.date));
      const rightDays = right.map((transaction) => dayOfMonth(transaction.date));
      const daySeparation = Math.abs(average(leftDays) - average(rightDays));
      const stablePartitions = coefficientOfVariation(leftAmounts) <= 0.25 &&
        coefficientOfVariation(rightAmounts) <= 0.25;

      if ((stablePartitions && amountSeparation >= 0.25) || daySeparation >= 6) return true;
    }
  }
  return false;
}

function deduplicateSuggestions(suggestions: RecurrenceSuggestion[]): RecurrenceSuggestion[] {
  const byTransactions = new Map<string, RecurrenceSuggestion>();
  for (const suggestion of suggestions) {
    const key = [...suggestion.transactionIds].sort().join("|");
    const previous = byTransactions.get(key);
    const previousIsLegacy = previous && !previous.patternKind;
    const suggestionIsPatternSpecific = Boolean(suggestion.patternKind);
    if (
      !previous ||
      (!previousIsLegacy && !suggestionIsPatternSpecific) ||
      (!previousIsLegacy && suggestion.confidenceScore > previous.confidenceScore)
    ) {
      byTransactions.set(key, suggestion);
    }
  }
  return [...byTransactions.values()];
}

function normalizedDescriptionDiversity(group: NormalizedTransaction[]): number {
  return new Set(group.map((transaction) => transaction.normalizedDescription)).size / group.length;
}

function rawDescriptionContextDiversity(group: NormalizedTransaction[]): number {
  const descriptions = group.map((transaction) => transaction.description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .trim());
  return new Set(descriptions).size / group.length;
}

function hasMultipleOccurrencesInMonth(group: NormalizedTransaction[]): boolean {
  const months = new Set<string>();
  for (const transaction of group) {
    const month = transaction.date.slice(0, 7);
    if (months.has(month)) return true;
    months.add(month);
  }
  return false;
}

function hasOnlyEpisodicDescriptions(group: NormalizedTransaction[]): boolean {
  const episodic = /\b(compra|pedido|comanda|turma|reserva|acessorio|avulso|avulsos)\b/i;
  return group.every((transaction) => episodic.test(transaction.description)) &&
    !hasStableExplicitIdentity(group);
}

function retainDominantCadenceTrack(
  group: NormalizedTransaction[],
  cadenceDays: number
): NormalizedTransaction[] {
  const tracks = group.map((anchor) => group.filter((transaction) => {
    const gap = Math.abs(Math.round(
      (parseIsoDate(transaction.date).getTime() - parseIsoDate(anchor.date).getTime()) /
      (24 * 60 * 60 * 1000)
    ));
    const remainder = gap % cadenceDays;
    return remainder <= 2 || cadenceDays - remainder <= 2;
  }));
  return (tracks.sort((left, right) => right.length - left.length)[0] ?? group)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function hasSingleCoreContamination(group: NormalizedTransaction[], candidateKey: string): boolean {
  const core = candidateKey.match(/\|token:([^|]+)(?:\||$)/)?.[1];
  if (!core) return false;

  const secondaryCounts = new Map<string, number>();
  for (const transaction of group) {
    for (const token of getDistinctiveTokens(transaction)) {
      if (token !== core) secondaryCounts.set(token, (secondaryCounts.get(token) ?? 0) + 1);
    }
  }
  const dominant = [...secondaryCounts.entries()]
    .filter(([, count]) => count >= group.length * 0.6 && count < group.length)
    .sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!dominant) return false;

  return group.some((transaction) => {
    const secondary = getDistinctiveTokens(transaction).filter((token) => token !== core);
    return !secondary.includes(dominant) && secondary.length > 0;
  });
}

function splitByExplicitIdentity(
  group: NormalizedTransaction[]
): NormalizedTransaction[][] {
  const byDocument = splitWhenEveryTransactionHasKey(
    group,
    (transaction) => transaction.documentNumber?.replace(/\D/g, "") || undefined
  );
  if (byDocument.length > 1) return byDocument;

  return splitWhenEveryTransactionHasKey(
    group,
    (transaction) => transaction.normalizedCounterparty
  );
}

function splitWhenEveryTransactionHasKey(
  group: NormalizedTransaction[],
  getKey: (transaction: NormalizedTransaction) => string | undefined
): NormalizedTransaction[][] {
  const keyed = group.map((transaction) => ({ transaction, key: getKey(transaction) }));
  if (keyed.some(({ key }) => !key)) return [group];

  const values = new Map<string, NormalizedTransaction[]>();
  for (const { transaction, key } of keyed) {
    const items = values.get(key ?? "") ?? [];
    items.push(transaction);
    values.set(key ?? "", items);
  }

  return values.size > 1 ? [...values.values()] : [group];
}

function removeLowCoherenceOutliers(
  group: NormalizedTransaction[],
  thresholds: ReturnType<typeof mergeThresholds>
): NormalizedTransaction[] {
  let refined = [...group];

  while (refined.length >= 4) {
    const baselinePeriodicity = detectPeriodicity(refined, thresholds).score;
    const candidates = refined.map((transaction) => {
      const others = refined.filter((candidate) => candidate.id !== transaction.id);
      const averageTextSimilarity = others.reduce(
        (sum, candidate) => sum + compareTransactionsText(transaction, candidate).score,
        0
      ) / others.length;
      const periodicityWithoutCandidate = detectPeriodicity(others, thresholds).score;

      return {
        transaction,
        averageTextSimilarity,
        periodicityGain: periodicityWithoutCandidate - baselinePeriodicity
      };
    }).filter(({ averageTextSimilarity, periodicityGain }) =>
      averageTextSimilarity < thresholds.weakTextSimilarityThreshold &&
      periodicityGain >= 0.1
    ).sort((left, right) => right.periodicityGain - left.periodicityGain);

    const outlier = candidates[0];
    if (!outlier) break;
    refined = refined.filter((transaction) => transaction.id !== outlier.transaction.id);
  }

  return refined;
}

function retainDominantMonthlyTrack(
  group: NormalizedTransaction[],
  thresholds: ReturnType<typeof mergeThresholds>
): NormalizedTransaction[] {
  if (group.length < 5) return group;

  const cores = group.map((anchor) => group.filter((transaction) =>
    hasCompatibleMonthPosition(anchor.date, transaction.date, 1)
  ));
  const core = cores.sort((left, right) => right.length - left.length)[0] ?? [];
  if (core.length < 3 || core.length / group.length < 0.6) return group;

  const anchor = core[0];
  if (!anchor) return group;
  const refined = group.filter((transaction) =>
    hasCompatibleMonthPosition(anchor.date, transaction.date, 2)
  );
  if (refined.length < 3 || refined.length === group.length) return group;

  const originalPeriodicity = detectPeriodicity(group, thresholds).score;
  const refinedPeriodicity = detectPeriodicity(refined, thresholds).score;
  return refinedPeriodicity >= originalPeriodicity ? refined : group;
}

function hasCompatibleMonthPosition(left: string, right: string, tolerance: number): boolean {
  if (isLastDayOfMonth(left) && isLastDayOfMonth(right)) return true;
  return Math.abs(dayOfMonth(left) - dayOfMonth(right)) <= tolerance;
}

function isLastDayOfMonth(value: string): boolean {
  const date = parseIsoDate(value);
  const nextDay = new Date(date.getTime());
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.getUTCMonth() !== date.getUTCMonth();
}

function hasContradictoryMerchantContext(
  group: NormalizedTransaction[],
  allTransactions: NormalizedTransaction[],
  groupPeriodicity: ReturnType<typeof detectPeriodicity>,
  thresholds: ReturnType<typeof mergeThresholds>
): boolean {
  if (
    group.length >= 4 &&
    groupPeriodicity.score >= 0.9 &&
    groupPeriodicity.dayOfMonthConsistencyScore >= 0.8
  ) {
    return false;
  }
  if (group.some((transaction) => /\d{1,2}\s*\/\s*\d{1,2}/.test(transaction.description))) {
    return false;
  }
  if (hasStableExplicitIdentity(group)) {
    return false;
  }

  const groupIds = new Set(group.map((transaction) => transaction.id));
  const externalContext = allTransactions.filter((candidate) =>
    !groupIds.has(candidate.id) &&
    candidate.companyId === group[0]?.companyId &&
    candidate.type === group[0]?.type &&
    group.some((transaction) =>
      relativeAmountDifference(candidate.absoluteAmount, transaction.absoluteAmount) <=
        thresholds.amountRelativeTolerance &&
      hasDistinctiveMerchantIdentity(candidate, transaction)
    )
  );
  if (externalContext.length === 0) return false;

  const expandedPeriodicity = detectPeriodicity([...group, ...externalContext], thresholds);
  const periodicityDrop = groupPeriodicity.score - expandedPeriodicity.score;

  if (group.length === 2) {
    return periodicityDrop >= 0.04 &&
      expandedPeriodicity.monthlyGapRatio < groupPeriodicity.monthlyGapRatio;
  }

  return externalContext.length >= 2 &&
    expandedPeriodicity.score < thresholds.minimumPeriodicityScoreForSuggestion &&
    periodicityDrop >= 0.25;
}

function hasStableExplicitIdentity(group: NormalizedTransaction[]): boolean {
  const documents = group
    .map((transaction) => transaction.documentNumber?.replace(/\D/g, ""))
    .filter((document): document is string => Boolean(document));
  if (documents.length === group.length && new Set(documents).size === 1) return true;

  const counterparties = group
    .map((transaction) => transaction.normalizedCounterparty)
    .filter((counterparty): counterparty is string => Boolean(counterparty));
  return counterparties.length === group.length && new Set(counterparties).size === 1;
}

function relativeAmountDifference(left: number, right: number): number {
  const denominator = (left + right) / 2;
  return denominator === 0 ? 0 : Math.abs(left - right) / denominator;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coefficientOfVariation(values: number[]): number {
  const mean = average(values);
  if (mean === 0) return 0;
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function mergeOverlappingGroups(
  groups: NormalizedTransaction[][],
  allTransactions: NormalizedTransaction[]
): NormalizedTransaction[][] {
  const parent = new Map<string, string>();
  const groupedIds = new Set<string>();

  for (const group of groups) {
    for (const transaction of group) {
      if (!parent.has(transaction.id)) {
        parent.set(transaction.id, transaction.id);
      }
      groupedIds.add(transaction.id);
    }

    const first = group[0];
    if (!first) continue;
    for (const transaction of group.slice(1)) {
      union(parent, first.id, transaction.id);
    }
  }

  const byRoot = new Map<string, NormalizedTransaction[]>();
  const transactionById = new Map(allTransactions.map((transaction) => [transaction.id, transaction]));

  for (const id of groupedIds) {
    const transaction = transactionById.get(id);
    if (!transaction) continue;
    const root = find(parent, id);
    const values = byRoot.get(root) ?? [];
    values.push(transaction);
    byRoot.set(root, values);
  }

  return [...byRoot.values()]
    .filter((group) => group.length >= 2)
    .map((group) => group.sort((left, right) => left.date.localeCompare(right.date)));
}

function chooseRepresentativeTransaction(transactions: NormalizedTransaction[]): NormalizedTransaction {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    counts.set(transaction.normalizedDescription, (counts.get(transaction.normalizedDescription) ?? 0) + 1);
  }

  const [normalizedDescription] = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return right[0].length - left[0].length;
  })[0] ?? [transactions[0]?.normalizedDescription ?? ""];

  return (
    transactions.find((transaction) => transaction.normalizedDescription === normalizedDescription) ??
    transactions[0] ??
    fallbackTransaction
  );
}

function extractInstallmentCount(transactions: NormalizedTransaction[]): number | undefined {
  const denominators = transactions
    .map((transaction) => transaction.description.match(/(?:parcela\s*)?(\d{1,2})\s*\/\s*(\d{1,2})/i)?.[2])
    .filter((value): value is string => Boolean(value))
    .map(Number);

  if (denominators.length === 0) {
    return undefined;
  }

  const counts = new Map<number, number>();
  for (const denominator of denominators) {
    counts.set(denominator, (counts.get(denominator) ?? 0) + 1);
  }

  const [installmentCount] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
  return installmentCount;
}

function buildVariableRecurrenceReasons(
  amountStability: ReturnType<typeof analyzeAmountStability>,
  periodicity: ReturnType<typeof detectPeriodicity>,
  textSimilarity: ReturnType<typeof analyzeGroupTextSimilarity>
): string[] {
  if (
    amountStability.recurrenceType === "variable" &&
    amountStability.amountVariationPercent > 15 &&
    periodicity.frequency === "monthly" &&
    textSimilarity.score > 0
  ) {
    return [
      "variacao de valor acima de 15%, mas periodicidade mensal e similaridade textual sustentam recorrencia variavel"
    ];
  }

  return [];
}

function stableHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function find(parent: Map<string, string>, id: string): string {
  const current = parent.get(id);
  if (!current || current === id) {
    return id;
  }

  const root = find(parent, current);
  parent.set(id, root);
  return root;
}

function union(parent: Map<string, string>, left: string, right: string): void {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) {
    parent.set(rightRoot, leftRoot);
  }
}

const fallbackTransaction: NormalizedTransaction = {
  id: "",
  companyId: "",
  date: "",
  amount: 0,
  type: "expense",
  description: "",
  normalizedDescription: "",
  normalizedTokens: [],
  absoluteAmount: 0,
  amountBucketIndex: DEFAULT_THRESHOLDS.amountBands.length - 1
};
