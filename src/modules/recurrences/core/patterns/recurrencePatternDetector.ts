import type { ThresholdConfig } from "../config/defaultThresholds.ts";
import { detectPeriodicity } from "../periodicity/periodicityDetector.ts";
import type {
  AmountStabilityResult,
  NormalizedTransaction,
  PeriodicityResult,
  RecurrencePatternKind
} from "../types.ts";
import { addMonthsClamped, daysBetween, parseIsoDate } from "../utils/dateUtils.ts";

export interface RecurrencePatternResult {
  kind: RecurrencePatternKind;
  periodicity: PeriodicityResult;
  patternScore: number;
  reasons: string[];
}

export function detectBestRecurrencePattern(
  transactions: NormalizedTransaction[],
  amountStability: AmountStabilityResult,
  thresholds: ThresholdConfig
): RecurrencePatternResult | undefined {
  return (
    detectInstallmentPattern(transactions) ??
    detectMonthlyPattern(transactions, amountStability, thresholds) ??
    detectShortCadencePattern(transactions) ??
    detectFrequentBusinessPattern(transactions)
  );
}

export function detectMonthlyPattern(
  transactions: NormalizedTransaction[],
  amountStability: AmountStabilityResult,
  thresholds: ThresholdConfig
): RecurrencePatternResult | undefined {
  const periodicity = detectPeriodicity(transactions, thresholds);
  if (periodicity.score < thresholds.minimumPeriodicityScoreForSuggestion) return undefined;

  const baseKind = amountStability.recurrenceType === "fixed"
    ? "monthly_fixed"
    : "monthly_variable";
  const kind = transactions[0]?.type === "income" ? "recurring_income" : baseKind;
  return {
    kind,
    periodicity,
    patternScore: periodicity.score,
    reasons: [`detector de padrao: ${kind}`]
  };
}

export function detectShortCadencePattern(
  transactions: NormalizedTransaction[]
): RecurrencePatternResult | undefined {
  const dates = uniqueDates(transactions);
  if (dates.length < 4) return undefined;
  const gaps = consecutiveGaps(dates);
  const weeklyRatio = ratioWithin(gaps, 5, 9);
  const biweeklyRatio = ratioWithin(gaps, 11, 17);
  const bestRatio = Math.max(weeklyRatio, biweeklyRatio);
  if (bestRatio < 0.6) return undefined;

  const frequency = weeklyRatio >= biweeklyRatio ? "weekly" : "biweekly";
  const score = clamp01(0.5 + bestRatio * 0.45);
  const kind = transactions[0]?.type === "income"
    ? "recurring_income"
    : frequency === "weekly" ? "weekly_recurring" : "biweekly_recurring";
  return {
    kind,
    patternScore: score,
    periodicity: periodicityResult(frequency, score, dates, gaps, bestRatio),
    reasons: [`detector de padrao: ${kind}`, `${Math.round(bestRatio * 100)}% dos intervalos no ritmo ${frequency}`]
  };
}

export function detectFrequentBusinessPattern(
  transactions: NormalizedTransaction[]
): RecurrencePatternResult | undefined {
  const dates = uniqueDates(transactions);
  if (dates.length < 4 || distinctMonthCount(dates) < 3) return undefined;
  const gaps = consecutiveGaps(dates);
  const medianGap = median(gaps);
  if (medianGap < 5 || medianGap > 60) return undefined;
  const regularGapRatio = gaps.filter((gap) =>
    gap >= medianGap * 0.55 && gap <= medianGap * 1.45
  ).length / gaps.length;
  if (regularGapRatio < 0.6) return undefined;

  const score = clamp01(0.48 + regularGapRatio * 0.35 + Math.min(0.12, dates.length * 0.015));
  const kind = transactions[0]?.type === "income"
    ? "recurring_income"
    : medianGap <= 35 ? "frequent_supplier" : "irregular_business_recurring";
  return {
    kind,
    patternScore: score,
    periodicity: periodicityResult("unknown", score, dates, gaps, regularGapRatio),
    reasons: [
      `detector de padrao: ${kind}`,
      `${dates.length} ocorrencias em ${distinctMonthCount(dates)} meses`,
      `intervalo mediano ${Math.round(medianGap)} dias`
    ]
  };
}

export function detectInstallmentPattern(
  transactions: NormalizedTransaction[]
): RecurrencePatternResult | undefined {
  const installments = transactions
    .map((transaction) => transaction.description.match(/(?:parcela|parc|prestacao)?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i))
    .filter((match): match is RegExpMatchArray => Boolean(match));
  if (installments.length < 2) return undefined;
  if (installments.length !== transactions.length) return undefined;
  const totals = installments.map((match) => Number(match[2]));
  const total = mode(totals);
  if (!total || installments.filter((match) => Number(match[2]) === total).length < 2) return undefined;

  const dates = uniqueDates(transactions);
  const gaps = consecutiveGaps(dates);
  const score = 0.9;
  return {
    kind: "installment",
    patternScore: score,
    periodicity: periodicityResult("monthly", score, dates, gaps, 1),
    reasons: [`detector de padrao: installment`, `sequencia explicita de ${total} parcelas`]
  };
}

function periodicityResult(
  frequency: PeriodicityResult["frequency"],
  score: number,
  dates: string[],
  gaps: number[],
  gapRatio: number
): PeriodicityResult {
  const lastDate = dates[dates.length - 1];
  return {
    frequency,
    score,
    averageGapDays: average(gaps),
    monthlyGapRatio: frequency === "monthly" ? gapRatio : 0,
    dayOfMonthConsistencyScore: 0,
    expectedNextDate: lastDate && frequency === "monthly" ? addMonthsClamped(lastDate, 1) : undefined,
    reasons: [`padrao temporal ${frequency} com evidencia ${Math.round(score * 100)}%`]
  };
}

function uniqueDates(transactions: NormalizedTransaction[]): string[] {
  return [...new Set(transactions.map((transaction) => transaction.date))].sort();
}

function consecutiveGaps(dates: string[]): number[] {
  return dates.slice(1).map((date, index) => Math.abs(daysBetween(dates[index] ?? date, date)));
}

function distinctMonthCount(dates: string[]): number {
  return new Set(dates.map((date) => {
    const parsed = parseIsoDate(date);
    return `${parsed.getUTCFullYear()}-${parsed.getUTCMonth()}`;
  })).size;
}

function ratioWithin(values: number[], min: number, max: number): number {
  return values.length === 0 ? 0 : values.filter((value) => value >= min && value <= max).length / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function mode(values: number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
