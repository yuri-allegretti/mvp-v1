import { DEFAULT_THRESHOLDS, type ThresholdConfig } from "../config/defaultThresholds.ts";
import type {
  CategoryConsistencyResult,
  NormalizedTransaction,
  RecurrenceScoreInput,
  RecurrenceScoreResult
} from "../types.ts";

export function analyzeCategoryConsistency(transactions: NormalizedTransaction[]): CategoryConsistencyResult {
  const categories = transactions
    .map((transaction) => transaction.categoryId)
    .filter((categoryId): categoryId is string => Boolean(categoryId));

  if (categories.length === 0) {
    return {
      score: 0.5,
      reasons: ["categoria ausente: usada como sinal neutro"]
    };
  }

  const counts = new Map<string, number>();
  for (const category of categories) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const [categoryId, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [undefined, 0];
  const score = count / transactions.length;

  return {
    score,
    categoryId,
    reasons: [
      score === 1
        ? "categoria consistente"
        : "categoria divergente: nao bloqueia deteccao"
    ]
  };
}

export function calculateRecurrenceScore(
  input: RecurrenceScoreInput,
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS
): RecurrenceScoreResult {
  const occurrenceScore = calculateOccurrenceScore(input.occurrenceCount);
  const weights = thresholds.scoreWeights;

  const rawConfidenceScore = Math.round(
    input.periodicity.score * weights.periodicity +
    input.textSimilarity.score * weights.textSimilarity +
    input.amountStability.score * weights.amountStability +
    input.categoryConsistency.score * weights.category +
    occurrenceScore * weights.occurrence
  );
  const confidenceScore = capLowPeriodicityConfidence(rawConfidenceScore, input.periodicity.score);

  const reasons = [
    ...input.periodicity.reasons,
    ...input.textSimilarity.reasons,
    ...input.amountStability.reasons,
    ...input.categoryConsistency.reasons,
    occurrenceReason(input.occurrenceCount),
    ...(confidenceScore < rawConfidenceScore
      ? ["periodicidade baixa limita a confianca da sugestao"]
      : [])
  ];

  return {
    confidenceScore,
    periodicityScore: Math.round(input.periodicity.score * 100),
    textSimilarityScore: Math.round(input.textSimilarity.score * 100),
    amountStabilityScore: Math.round(input.amountStability.score * 100),
    categoryScore: Math.round(input.categoryConsistency.score * 100),
    occurrenceScore: Math.round(occurrenceScore * 100),
    reasons
  };
}

export function calculateOccurrenceScore(occurrenceCount: number): number {
  if (occurrenceCount >= 4) return 1;
  if (occurrenceCount === 3) return 0.75;
  if (occurrenceCount === 2) return 0.25;
  return 0;
}

function occurrenceReason(occurrenceCount: number): string {
  if (occurrenceCount >= 4) return "quatro ou mais ocorrencias: candidato forte";
  if (occurrenceCount === 3) return "tres ocorrencias: candidato provavel";
  if (occurrenceCount === 2) return "duas ocorrencias: candidato fraco";
  return "menos de duas ocorrencias";
}

function capLowPeriodicityConfidence(confidenceScore: number, periodicityScore: number): number {
  if (periodicityScore < DEFAULT_THRESHOLDS.minimumPeriodicityScoreForSuggestion) {
    return Math.min(confidenceScore, DEFAULT_THRESHOLDS.minimumSuggestionScore - 1);
  }

  return confidenceScore;
}
