import { detectRecurrences } from "../service/recurrenceDetectionService.ts";
import type { EvaluationResult, LabeledTransaction, RecurrenceSuggestion } from "../types.ts";

export function evaluateRecurrenceDetection(
  transactions: LabeledTransaction[],
  suggestions: RecurrenceSuggestion[] = detectRecurrences(transactions)
): EvaluationResult {
  const expectedPairs = buildExpectedPairs(transactions);
  const predictedPairs = buildPredictedPairs(suggestions);

  let truePositives = 0;
  let falsePositives = 0;

  for (const pair of predictedPairs) {
    if (expectedPairs.has(pair)) {
      truePositives += 1;
    } else {
      falsePositives += 1;
    }
  }

  let falseNegatives = 0;
  for (const pair of expectedPairs) {
    if (!predictedPairs.has(pair)) {
      falseNegatives += 1;
    }
  }

  const precision = truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0 ? 1 : truePositives / (truePositives + falseNegatives);
  const f1Score = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1Score,
    expectedPairCount: expectedPairs.size,
    predictedPairCount: predictedPairs.size,
    suggestionCount: suggestions.length
  };
}

function buildExpectedPairs(transactions: LabeledTransaction[]): Set<string> {
  const byGroup = new Map<string, string[]>();

  for (const transaction of transactions) {
    if (!transaction.expectedRecurrenceGroupId) {
      continue;
    }

    const ids = byGroup.get(transaction.expectedRecurrenceGroupId) ?? [];
    ids.push(transaction.id);
    byGroup.set(transaction.expectedRecurrenceGroupId, ids);
  }

  return buildPairs([...byGroup.values()]);
}

function buildPredictedPairs(suggestions: RecurrenceSuggestion[]): Set<string> {
  return buildPairs(suggestions.map((suggestion) => suggestion.transactionIds));
}

function buildPairs(groups: string[][]): Set<string> {
  const pairs = new Set<string>();

  for (const group of groups) {
    const sorted = [...group].sort();
    for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
        const left = sorted[leftIndex];
        const right = sorted[rightIndex];
        if (!left || !right) continue;

        pairs.add(`${left}|${right}`);
      }
    }
  }

  return pairs;
}
