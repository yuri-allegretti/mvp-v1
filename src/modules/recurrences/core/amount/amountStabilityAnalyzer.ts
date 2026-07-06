import type { AmountStabilityResult, NormalizedTransaction } from "../types.ts";

export function analyzeAmountStability(transactions: NormalizedTransaction[]): AmountStabilityResult {
  const absoluteAmounts = transactions.map((transaction) => Math.abs(transaction.amount));
  const signedAmounts = transactions.map((transaction) => transaction.amount);

  const averageAbsoluteAmount = average(absoluteAmounts);
  const averageAmount = roundMoney(average(signedAmounts));
  const minAmount = Math.min(...absoluteAmounts);
  const maxAmount = Math.max(...absoluteAmounts);
  const amountVariationPercent = averageAbsoluteAmount === 0
    ? 0
    : ((maxAmount - minAmount) / averageAbsoluteAmount) * 100;
  const coefficientOfVariation = averageAbsoluteAmount === 0
    ? 0
    : standardDeviation(absoluteAmounts) / averageAbsoluteAmount;

  const recurrenceType = amountVariationPercent <= 5 ? "fixed" : "variable";
  const score = scoreAmountVariation(amountVariationPercent);
  const reasons: string[] = [
    `variacao de valor ${Math.round(amountVariationPercent)}%`,
    recurrenceType === "fixed" ? "valor classificado como fixo" : "valor classificado como variavel"
  ];

  if (amountVariationPercent > 5 && amountVariationPercent <= 15) {
    reasons.push("valor quase fixo, mas acima do limite de 5%");
  }

  return {
    recurrenceType,
    score,
    averageAmount,
    estimatedNextAmount: averageAmount,
    minAmount: roundMoney(minAmount),
    maxAmount: roundMoney(maxAmount),
    amountVariationPercent,
    coefficientOfVariation,
    reasons
  };
}

function scoreAmountVariation(variationPercent: number): number {
  if (variationPercent <= 5) return 1;
  if (variationPercent <= 15) return 0.8;
  if (variationPercent <= 30) return 0.55;
  if (variationPercent <= 50) return 0.35;
  return 0.1;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const avg = average(values);
  const variance = average(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
