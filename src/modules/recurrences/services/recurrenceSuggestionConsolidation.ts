import { createHash } from "node:crypto";
import type { Transaction as PersistedTransaction } from "@prisma/client";
import type {
  RecurrencePatternKind,
  RecurrenceSuggestion as CoreRecurrenceSuggestion,
} from "../core/types.ts";

export const logicalSuggestionOverlapThreshold = 0.7;

export interface RecurrenceTransactionIdentity {
  id: string;
  bankAccountId: string;
  date: Date | string;
}

type PatternFamily = "installment" | "weekly" | "biweekly" | "monthly" | "irregular";

function patternFamily(suggestion: Pick<
  CoreRecurrenceSuggestion,
  "frequency" | "patternKind" | "installmentCount"
>): PatternFamily {
  if (suggestion.patternKind === "installment" || suggestion.installmentCount) return "installment";
  if (suggestion.frequency === "weekly" || suggestion.patternKind === "weekly_recurring") return "weekly";
  if (
    suggestion.frequency === "biweekly" ||
    suggestion.patternKind === "biweekly_recurring" ||
    suggestion.patternKind === "frequent_supplier"
  ) {
    return "biweekly";
  }
  if (
    suggestion.frequency === "monthly" ||
    suggestion.patternKind === "monthly_fixed" ||
    suggestion.patternKind === "monthly_variable" ||
    suggestion.patternKind === "recurring_income"
  ) {
    return "monthly";
  }
  return "irregular";
}

function bankAccounts(
  transactionIds: string[],
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): string {
  return [...new Set(transactionIds.map((id) => transactionsById.get(id)?.bankAccountId).filter(Boolean))]
    .sort()
    .join("|");
}

function overlapCoefficient(leftIds: string[], rightIds: string[]): number {
  const left = new Set(leftIds);
  const right = new Set(rightIds);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const id of left) {
    if (right.has(id)) intersection += 1;
  }
  return intersection / Math.min(left.size, right.size);
}

function dateValue(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(`${value}T00:00:00.000Z`).getTime();
}

function evidenceSpan(
  suggestion: CoreRecurrenceSuggestion,
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): number {
  const dates = suggestion.transactionIds
    .map((id) => transactionsById.get(id)?.date)
    .filter((value): value is Date | string => value !== undefined)
    .map(dateValue);
  return dates.length === 0 ? 0 : Math.max(...dates) - Math.min(...dates);
}

function compareQuality(
  left: CoreRecurrenceSuggestion,
  right: CoreRecurrenceSuggestion,
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): number {
  return (
    right.transactionIds.length - left.transactionIds.length ||
    right.confidenceScore - left.confidenceScore ||
    evidenceSpan(right, transactionsById) - evidenceSpan(left, transactionsById) ||
    left.id.localeCompare(right.id)
  );
}

export function areLogicalRecurrenceSuggestionsEquivalent(params: {
  left: Pick<
    CoreRecurrenceSuggestion,
    "companyId" | "type" | "frequency" | "patternKind" | "installmentCount" | "transactionIds"
  >;
  right: Pick<
    CoreRecurrenceSuggestion,
    "companyId" | "type" | "frequency" | "patternKind" | "installmentCount" | "transactionIds"
  >;
  transactionsById: Map<string, RecurrenceTransactionIdentity>;
}): boolean {
  if (params.left.companyId !== params.right.companyId) return false;
  if (params.left.type !== params.right.type) return false;
  if (patternFamily(params.left) !== patternFamily(params.right)) return false;
  if (
    bankAccounts(params.left.transactionIds, params.transactionsById) !==
    bankAccounts(params.right.transactionIds, params.transactionsById)
  ) {
    return false;
  }
  return overlapCoefficient(params.left.transactionIds, params.right.transactionIds) > logicalSuggestionOverlapThreshold;
}

export function consolidateCoreRecurrenceSuggestions(
  suggestions: CoreRecurrenceSuggestion[],
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): CoreRecurrenceSuggestion[] {
  const ranked = [...suggestions].sort((left, right) => compareQuality(left, right, transactionsById));
  const consolidated: CoreRecurrenceSuggestion[] = [];
  for (const suggestion of ranked) {
    const duplicate = consolidated.some((existing) =>
      areLogicalRecurrenceSuggestionsEquivalent({
        left: suggestion,
        right: existing,
        transactionsById,
      }),
    );
    if (!duplicate) consolidated.push(suggestion);
  }
  return consolidated;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);
}

export function buildLogicalRecurrenceSuggestionKey(
  suggestion: CoreRecurrenceSuggestion,
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): string {
  const anchors = suggestion.transactionIds
    .map((id) => transactionsById.get(id))
    .filter((transaction): transaction is RecurrenceTransactionIdentity => Boolean(transaction))
    .sort((left, right) => dateValue(left.date) - dateValue(right.date) || left.id.localeCompare(right.id))
    .slice(0, 2)
    .map((transaction) => transaction.id);
  const identity = [
    "recurrence-logical-v2",
    suggestion.companyId,
    bankAccounts(suggestion.transactionIds, transactionsById),
    suggestion.type,
    patternFamily(suggestion),
    ...anchors,
  ].join("|");
  return `recurrence:v2:${stableHash(identity)}`;
}

export function buildLogicalRecurrenceSuggestionCollisionKey(
  logicalKey: string,
  detectorSuggestionId: string,
): string {
  return `${logicalKey}:${stableHash(detectorSuggestionId)}`;
}

export function persistedTransactionIdentity(
  transaction: Pick<PersistedTransaction, "id" | "bankAccountId" | "date">,
): RecurrenceTransactionIdentity {
  return transaction;
}

export function patternFamilyForDiagnostics(patternKind: RecurrencePatternKind | undefined, frequency: CoreRecurrenceSuggestion["frequency"]): PatternFamily {
  return patternFamily({ patternKind, frequency });
}
