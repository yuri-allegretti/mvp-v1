import type {
  AmountStabilityResult,
  CategoryConsistencyResult,
  RecurrencePatternKind,
  RecurrenceScoreResult
} from "../types.ts";
import { calculateOccurrenceScore } from "./recurrenceScorer.ts";

export interface PatternScoreInput {
  kind: RecurrencePatternKind;
  patternScore: number;
  identityScore: number;
  amountStability: AmountStabilityResult;
  categoryConsistency: CategoryConsistencyResult;
  occurrenceCount: number;
  reasons: string[];
}

export function calculatePatternRecurrenceScore(input: PatternScoreInput): RecurrenceScoreResult {
  const weights = weightsFor(input.kind);
  const occurrenceScore = calculateOccurrenceScore(input.occurrenceCount);
  const confidenceScore = Math.round(
    input.patternScore * weights.pattern +
    input.identityScore * weights.identity +
    input.amountStability.score * weights.amount +
    input.categoryConsistency.score * weights.category +
    occurrenceScore * weights.occurrence
  );

  return {
    confidenceScore,
    periodicityScore: Math.round(input.patternScore * 100),
    textSimilarityScore: Math.round(input.identityScore * 100),
    amountStabilityScore: Math.round(input.amountStability.score * 100),
    categoryScore: Math.round(input.categoryConsistency.score * 100),
    occurrenceScore: Math.round(occurrenceScore * 100),
    reasons: [...input.reasons, `score especifico do padrao ${input.kind}`]
  };
}

function weightsFor(kind: RecurrencePatternKind): {
  pattern: number;
  identity: number;
  amount: number;
  category: number;
  occurrence: number;
} {
  if (kind === "monthly_fixed" || kind === "installment") {
    return { pattern: 30, identity: 30, amount: 25, category: 5, occurrence: 10 };
  }
  if (kind === "monthly_variable" || kind === "recurring_income") {
    return { pattern: 30, identity: 35, amount: 5, category: 5, occurrence: 25 };
  }
  return { pattern: 35, identity: 35, amount: 5, category: 5, occurrence: 20 };
}
