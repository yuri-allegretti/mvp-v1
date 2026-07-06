import { DEFAULT_THRESHOLDS, type ThresholdConfig } from "../config/defaultThresholds.ts";
import type { NormalizedTransaction, PeriodicityResult } from "../types.ts";
import {
  addMonthsClamped,
  dayOfMonth,
  daysBetween,
  isMonthlyCadencePair,
  isMonthlyPair
} from "../utils/dateUtils.ts";

export function detectPeriodicity(
  transactions: NormalizedTransaction[],
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS
): PeriodicityResult {
  const sortedDates = [...new Set(transactions.map((transaction) => transaction.date))].sort();
  if (sortedDates.length < 2) {
    return {
      frequency: "unknown",
      score: 0,
      monthlyGapRatio: 0,
      dayOfMonthConsistencyScore: 0,
      reasons: ["menos de duas datas distintas"]
    };
  }

  const gaps: number[] = [];
  let monthlyPairs = 0;
  let skippedMonthPairs = 0;

  for (let index = 1; index < sortedDates.length; index += 1) {
    const previous = sortedDates[index - 1];
    const current = sortedDates[index];
    if (!previous || !current) continue;

    gaps.push(Math.abs(daysBetween(previous, current)));
    if (isMonthlyPair(previous, current, thresholds)) {
      monthlyPairs += 1;
    } else if (isMonthlyCadencePair(previous, current, thresholds)) {
      skippedMonthPairs += 1;
    }
  }

  const monthlyEvidence = monthlyPairs + skippedMonthPairs * 0.75;
  const monthlyGapRatio = gaps.length === 0 ? 0 : monthlyEvidence / gaps.length;
  const dayOfMonthConsistencyScore = calculateDayOfMonthConsistency(sortedDates, thresholds);
  const averageGapDays = average(gaps);

  let score = monthlyGapRatio * 0.7 + dayOfMonthConsistencyScore * 0.3;
  if (sortedDates.length === 2) {
    const adjacentMonthlyPair = isMonthlyPair(sortedDates[0] ?? "", sortedDates[1] ?? "", thresholds);
    score = adjacentMonthlyPair ? Math.min(score, 0.62) : Math.min(score, 0.2);
  }

  const frequency = score >= 0.55 && monthlyGapRatio >= 0.5 ? "monthly" : "unknown";
  const expectedNextDate = frequency === "monthly" ? addMonthsClamped(sortedDates[sortedDates.length - 1] ?? "", 1) : undefined;

  const reasons: string[] = [
    `${monthlyPairs}/${gaps.length} intervalos mensais`,
    `consistencia do dia do mes ${Math.round(dayOfMonthConsistencyScore * 100)}%`
  ];

  if (skippedMonthPairs > 0) {
    reasons.push(`${skippedMonthPairs} intervalos com competencias ausentes`);
  }

  if (sortedDates.length === 2) {
    reasons.push("apenas duas ocorrencias: evidencia temporal limitada");
  }

  return {
    frequency,
    score: clamp01(score),
    averageGapDays,
    monthlyGapRatio,
    dayOfMonthConsistencyScore,
    expectedNextDate,
    reasons
  };
}

function calculateDayOfMonthConsistency(dates: string[], thresholds: ThresholdConfig): number {
  const days = dates.map(dayOfMonth).sort((left, right) => left - right);
  const medianDay = days[Math.floor(days.length / 2)] ?? 1;
  const averageDelta = average(days.map((day) => Math.abs(day - medianDay)));
  return clamp01(1 - averageDelta / thresholds.monthlyDayTolerance);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
