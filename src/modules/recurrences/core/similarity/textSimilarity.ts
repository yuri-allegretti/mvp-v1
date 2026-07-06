import { DEFAULT_ALIAS_GROUPS } from "../config/defaultThresholds.ts";
import type { GroupTextSimilarityResult, NormalizedTransaction, TextSimilarityResult } from "../types.ts";

export function compareTransactionsText(
  left: NormalizedTransaction,
  right: NormalizedTransaction
): TextSimilarityResult {
  const result = compareTokenSets(left.normalizedTokens, right.normalizedTokens);
  const identityReasons: string[] = [];
  let score = result.score;

  if (left.documentNumber && right.documentNumber && left.documentNumber === right.documentNumber) {
    score = Math.max(score, 0.95);
    identityReasons.push("documento consistente entre transacoes");
  }

  if (
    left.normalizedCounterparty &&
    right.normalizedCounterparty &&
    left.normalizedCounterparty === right.normalizedCounterparty
  ) {
    score = Math.max(score, 0.9);
    identityReasons.push(`contraparte consistente: ${left.normalizedCounterparty}`);
  }

  return {
    ...result,
    score,
    reasons: [...result.reasons, ...identityReasons]
  };
}

export function compareTokenSets(leftTokens: string[], rightTokens: string[]): TextSimilarityResult {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  const commonTokens = [...left].filter((token) => right.has(token));
  const unionSize = new Set([...left, ...right]).size;
  const minSize = Math.min(left.size, right.size);

  const importantLeft = leftTokens.filter(isImportantToken);
  const importantRight = rightTokens.filter(isImportantToken);
  const importantCommon = importantLeft.filter((token) => importantRight.includes(token));
  const importantMinSize = Math.min(importantLeft.length, importantRight.length);

  const jaccardScore = unionSize === 0 ? 0 : commonTokens.length / unionSize;
  const overlapScore = minSize === 0 ? 0 : commonTokens.length / minSize;
  const importantOverlapScore = importantMinSize === 0 ? 0 : importantCommon.length / importantMinSize;
  const subsetMatch = importantCommon.length >= 2 && importantOverlapScore >= 0.66;

  const sharedAliasGroups = intersect(getAliasGroups(leftTokens), getAliasGroups(rightTokens));
  const aliasScore = sharedAliasGroups.length > 0 ? 0.35 : 0;
  const subsetScore = subsetMatch ? 0.72 : 0;

  const score = clamp01(Math.max(
    jaccardScore,
    overlapScore * 0.85,
    importantOverlapScore * 0.9,
    subsetScore,
    aliasScore
  ));

  const reasons: string[] = [];
  if (left.size === 0 || right.size === 0) {
    reasons.push("baixa qualidade textual: descricoes normalizadas vazias ou genericas");
  }
  if (commonTokens.length > 0) {
    reasons.push(`tokens comuns: ${commonTokens.join(", ")}`);
  }
  if (subsetMatch) {
    reasons.push("subconjunto forte de tokens importantes");
  }
  if (sharedAliasGroups.length > 0) {
    reasons.push(`grupo semantico regrado: ${sharedAliasGroups.join(", ")}`);
  }

  return {
    score,
    jaccardScore,
    overlapScore,
    importantOverlapScore,
    subsetMatch,
    commonTokens,
    sharedAliasGroups,
    reasons
  };
}

export function analyzeGroupTextSimilarity(transactions: NormalizedTransaction[]): GroupTextSimilarityResult {
  if (transactions.length < 2) {
    return {
      score: 0,
      minScore: 0,
      maxScore: 0,
      averageScore: 0,
      pairCount: 0,
      reasons: ["menos de duas ocorrencias para comparar texto"]
    };
  }

  const scores: number[] = [];
  const reasons = new Set<string>();

  for (let leftIndex = 0; leftIndex < transactions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < transactions.length; rightIndex += 1) {
      const left = transactions[leftIndex];
      const right = transactions[rightIndex];
      if (!left || !right) continue;

      const result = compareTransactionsText(left, right);
      scores.push(result.score);
      for (const reason of result.reasons) {
        reasons.add(reason);
      }
    }
  }

  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const averageScore = average(scores);

  return {
    score: averageScore,
    minScore,
    maxScore,
    averageScore,
    pairCount: scores.length,
    reasons: [
      `similaridade textual media ${formatPercent(averageScore)}`,
      ...[...reasons].slice(0, 4)
    ]
  };
}

export function getAliasGroups(tokens: string[]): string[] {
  const tokenSet = new Set(tokens);
  const groups: string[] = [];

  for (const [group, aliases] of Object.entries(DEFAULT_ALIAS_GROUPS)) {
    if (aliases.some((alias) => tokenSet.has(alias))) {
      groups.push(group);
    }
  }

  return groups;
}

function isImportantToken(token: string): boolean {
  return token.length >= 4;
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
