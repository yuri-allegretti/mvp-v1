import type { ThresholdConfig } from "../config/defaultThresholds.ts";

export function parseIsoDate(value: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split("-").map(Number);
  const year = yearRaw ?? 0;
  const month = monthRaw ?? 1;
  const day = dayRaw ?? 1;

  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(left: string, right: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseIsoDate(right).getTime() - parseIsoDate(left).getTime()) / millisecondsPerDay);
}

export function monthDifference(left: string, right: string): number {
  const leftDate = parseIsoDate(left);
  const rightDate = parseIsoDate(right);

  return (
    (rightDate.getUTCFullYear() - leftDate.getUTCFullYear()) * 12 +
    (rightDate.getUTCMonth() - leftDate.getUTCMonth())
  );
}

export function dayOfMonth(value: string): number {
  return parseIsoDate(value).getUTCDate();
}

export function isMonthlyPair(left: string, right: string, thresholds: ThresholdConfig): boolean {
  const gap = Math.abs(daysBetween(left, right));
  if (gap >= thresholds.monthlyGapMinDays && gap <= thresholds.monthlyGapMaxDays) {
    return true;
  }

  const monthGap = Math.abs(monthDifference(left, right));
  const dayGap = Math.abs(dayOfMonth(left) - dayOfMonth(right));
  return monthGap === 1 && dayGap <= thresholds.monthlyDayTolerance;
}

export function isMonthlyCadencePair(
  left: string,
  right: string,
  thresholds: ThresholdConfig
): boolean {
  if (isMonthlyPair(left, right, thresholds)) {
    return true;
  }

  const monthGap = Math.abs(monthDifference(left, right));
  if (monthGap < 2 || monthGap > thresholds.monthlyMaxGapMonths) {
    return false;
  }

  if (isLastDayOfMonth(left) && isLastDayOfMonth(right)) {
    return true;
  }

  return dayOfMonth(left) === dayOfMonth(right);
}

export function addMonthsClamped(value: string, monthsToAdd: number): string {
  const date = parseIsoDate(value);
  const originalDay = date.getUTCDate();
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + monthsToAdd;
  const lastDay = lastDayOfMonth(targetYear, targetMonth);
  const result = new Date(Date.UTC(targetYear, targetMonth, Math.min(originalDay, lastDay)));

  return formatIsoDate(result);
}

function lastDayOfMonth(year: number, zeroBasedMonth: number): number {
  return new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate();
}

function isLastDayOfMonth(value: string): boolean {
  const date = parseIsoDate(value);
  return date.getUTCDate() === lastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth());
}
