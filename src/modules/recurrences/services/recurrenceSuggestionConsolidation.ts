import { createHash } from "node:crypto";
import type { Transaction as PersistedTransaction } from "@prisma/client";
import type {
  RecurrencePatternKind,
  RecurrenceSuggestion as CoreRecurrenceSuggestion,
} from "../core/types.ts";

export const logicalSuggestionOverlapThreshold = 0.7;
const materiallyDifferentConfidence = 5;
const semanticContainmentOverlapThreshold = 0.5;

export interface RecurrenceTransactionIdentity {
  id: string;
  bankAccountId: string;
  date: Date | string;
}

type PatternFamily = "installment" | "weekly" | "biweekly" | "monthly" | "irregular";

type ComparableSuggestion = Pick<
  CoreRecurrenceSuggestion,
  | "id"
  | "companyId"
  | "type"
  | "frequency"
  | "recurrenceType"
  | "patternKind"
  | "installmentCount"
  | "normalizedDescription"
  | "representativeDescription"
  | "averageAmount"
  | "estimatedNextAmount"
  | "amountVariationPercent"
  | "confidenceScore"
  | "transactionIds"
>;

const economicNoiseTokens = new Set([
  "ajuste",
  "auto",
  "comp",
  "cred",
  "credito",
  "deb",
  "debito",
  "doc",
  "lancto",
  "nf",
  "pag",
  "pagamento",
  "pagto",
  "parc",
  "parcela",
  "pix",
  "receb",
  "recebimento",
  "ref",
  "syn",
  "sintet",
  "sintetico",
  "ted",
  "transf",
  "transferencia",
]);

function normalizedTokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token) && !economicNoiseTokens.has(token));
}

function economicDescription(suggestion: Pick<ComparableSuggestion, "normalizedDescription" | "representativeDescription">): string {
  const source = suggestion.normalizedDescription || suggestion.representativeDescription;
  return [...new Set(normalizedTokens(source))].sort().join(" ");
}

function hasInstallmentMarker(
  suggestion: Pick<ComparableSuggestion, "normalizedDescription" | "representativeDescription">,
): boolean {
  return /\b(parc|parcela|parcelado|parcelamento)\b/i.test(
    `${suggestion.normalizedDescription} ${suggestion.representativeDescription}`,
  );
}

function patternFamily(suggestion: Pick<
  CoreRecurrenceSuggestion,
  "frequency" | "patternKind" | "installmentCount" | "normalizedDescription" | "representativeDescription"
>): PatternFamily {
  if (
    suggestion.patternKind === "installment" ||
    suggestion.installmentCount ||
    hasInstallmentMarker(suggestion)
  ) {
    return "installment";
  }
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

function jaccardCoefficient(leftIds: string[], rightIds: string[]): number {
  const left = new Set(leftIds);
  const right = new Set(rightIds);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const id of left) {
    if (right.has(id)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function tokenContainment(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / Math.min(leftTokens.size, rightTokens.size);
}

function amountCompatible(left: ComparableSuggestion, right: ComparableSuggestion): boolean {
  const leftAmount = Math.abs(left.averageAmount || left.estimatedNextAmount);
  const rightAmount = Math.abs(right.averageAmount || right.estimatedNextAmount);
  if (leftAmount === 0 || rightAmount === 0) return leftAmount === rightAmount;
  const relativeDifference = Math.abs(leftAmount - rightAmount) / Math.max(leftAmount, rightAmount);
  const observedVariation = Math.min(
    Math.max(left.amountVariationPercent, right.amountVariationPercent) / 100,
    0.3,
  );
  return relativeDifference <= Math.max(0.12, observedVariation);
}

function monthlyPhase(
  suggestion: Pick<ComparableSuggestion, "transactionIds">,
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): number | null {
  const days = suggestion.transactionIds
    .map((id) => transactionsById.get(id)?.date)
    .filter((date): date is Date | string => date !== undefined)
    .map((date) => new Date(dateValue(date)).getUTCDate())
    .sort((left, right) => left - right);
  return days.length === 0 ? null : days[Math.floor(days.length / 2)]!;
}

function phaseCompatible(
  left: ComparableSuggestion,
  right: ComparableSuggestion,
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): boolean {
  if (!["monthly", "installment"].includes(patternFamily(left))) return true;
  const leftPhase = monthlyPhase(left, transactionsById);
  const rightPhase = monthlyPhase(right, transactionsById);
  if (leftPhase === null || rightPhase === null) return true;
  const directDistance = Math.abs(leftPhase - rightPhase);
  return Math.min(directDistance, 31 - directDistance) <= 5;
}

function sameEconomicIdentity(
  left: ComparableSuggestion,
  right: ComparableSuggestion,
): boolean {
  if (left.recurrenceType !== right.recurrenceType) return false;
  const leftDescription = economicDescription(left);
  const rightDescription = economicDescription(right);
  if (leftDescription !== rightDescription && tokenContainment(leftDescription, rightDescription) < 0.8) {
    return false;
  }
  return amountCompatible(left, right);
}

function sameEconomicSeries(
  left: ComparableSuggestion,
  right: ComparableSuggestion,
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): boolean {
  return (
    patternFamily(left) === patternFamily(right) &&
    sameEconomicIdentity(left, right) &&
    phaseCompatible(left, right, transactionsById)
  );
}

function isInternalTransfer(suggestion: ComparableSuggestion): boolean {
  const tokens = new Set(
    normalizedTokens(`${suggestion.normalizedDescription} ${suggestion.representativeDescription}`),
  );
  return tokens.has("interna") && tokens.has("entre") && tokens.has("contas");
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

export function compareRecurrenceSuggestionQuality(
  left: CoreRecurrenceSuggestion,
  right: CoreRecurrenceSuggestion,
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): number {
  const equivalentEconomicSeries = sameEconomicSeries(left, right, transactionsById);
  const transactionDifference = right.transactionIds.length - left.transactionIds.length;
  const confidenceDifference = right.confidenceScore - left.confidenceScore;
  if (
    equivalentEconomicSeries &&
    Math.abs(confidenceDifference) < materiallyDifferentConfidence &&
    transactionDifference !== 0
  ) {
    return transactionDifference;
  }
  if (
    patternFamily(left) !== patternFamily(right) &&
    left.patternKind !== "recurring_income" &&
    right.patternKind !== "recurring_income" &&
    confidenceDifference !== 0
  ) {
    return confidenceDifference;
  }
  if (Math.abs(confidenceDifference) >= materiallyDifferentConfidence) {
    return confidenceDifference;
  }
  return (
    transactionDifference ||
    confidenceDifference ||
    evidenceSpan(right, transactionsById) - evidenceSpan(left, transactionsById) ||
    left.id.localeCompare(right.id)
  );
}

export function areLogicalRecurrenceSuggestionsEquivalent(params: {
  left: Pick<
    CoreRecurrenceSuggestion,
    | "id"
    | "companyId"
    | "type"
    | "frequency"
    | "recurrenceType"
    | "patternKind"
    | "installmentCount"
    | "normalizedDescription"
    | "representativeDescription"
    | "averageAmount"
    | "estimatedNextAmount"
    | "amountVariationPercent"
    | "confidenceScore"
    | "transactionIds"
  >;
  right: Pick<
    CoreRecurrenceSuggestion,
    | "id"
    | "companyId"
    | "type"
    | "frequency"
    | "recurrenceType"
    | "patternKind"
    | "installmentCount"
    | "normalizedDescription"
    | "representativeDescription"
    | "averageAmount"
    | "estimatedNextAmount"
    | "amountVariationPercent"
    | "confidenceScore"
    | "transactionIds"
  >;
  transactionsById: Map<string, RecurrenceTransactionIdentity>;
}): boolean {
  if (params.left.companyId !== params.right.companyId) return false;
  if (params.left.type !== params.right.type) return false;
  if (
    bankAccounts(params.left.transactionIds, params.transactionsById) !==
    bankAccounts(params.right.transactionIds, params.transactionsById)
  ) {
    return false;
  }
  const samePatternFamily = patternFamily(params.left) === patternFamily(params.right);
  if (!samePatternFamily) {
    const recurringIncomeVariant =
      params.left.patternKind === "recurring_income" &&
      params.right.patternKind === "recurring_income";
    const unspecifiedPatternVariant = !params.left.patternKind || !params.right.patternKind;
    if (!(recurringIncomeVariant || unspecifiedPatternVariant)) return false;
    if (!sameEconomicIdentity(params.left, params.right)) return false;
    const requiredOverlap = unspecifiedPatternVariant
      ? semanticContainmentOverlapThreshold
      : logicalSuggestionOverlapThreshold;
    return (
      overlapCoefficient(params.left.transactionIds, params.right.transactionIds) >=
      requiredOverlap
    );
  }
  if (sameEconomicSeries(params.left, params.right, params.transactionsById)) return true;
  return overlapCoefficient(params.left.transactionIds, params.right.transactionIds) > logicalSuggestionOverlapThreshold;
}

function isCoveredByBetterCandidates(params: {
  suggestion: CoreRecurrenceSuggestion;
  candidates: CoreRecurrenceSuggestion[];
  transactionsById: Map<string, RecurrenceTransactionIdentity>;
}): boolean {
  const suggestionAccounts = bankAccounts(params.suggestion.transactionIds, params.transactionsById);
  const scoped = params.candidates.filter((candidate) => {
    if (candidate.companyId !== params.suggestion.companyId || candidate.type !== params.suggestion.type) return false;
    if (bankAccounts(candidate.transactionIds, params.transactionsById) !== suggestionAccounts) return false;
    return jaccardCoefficient(candidate.transactionIds, params.suggestion.transactionIds) > 0;
  });
  const cadenceCompatible = scoped.filter((candidate) => {
    const candidateFamily = patternFamily(candidate);
    const suggestionFamily = patternFamily(params.suggestion);
    const candidateCadence = candidateFamily === "installment" ? "monthly" : candidateFamily;
    const suggestionCadence = suggestionFamily === "installment" ? "monthly" : suggestionFamily;
    return candidateCadence === suggestionCadence;
  });
  const semanticallyDominated = scoped.some((candidate) => {
    const candidateDescription = economicDescription(candidate);
    const suggestionDescription = economicDescription(params.suggestion);
    return (
      candidate.confidenceScore - params.suggestion.confidenceScore >=
        materiallyDifferentConfidence &&
      tokenContainment(candidateDescription, suggestionDescription) >= 0.8 &&
      overlapCoefficient(candidate.transactionIds, params.suggestion.transactionIds) >=
        semanticContainmentOverlapThreshold
    );
  });
  if (semanticallyDominated) return true;
  if (cadenceCompatible.length === 0) return false;
  const suggestionFamily = patternFamily(params.suggestion);
  const sameFamily = cadenceCompatible.filter(
    (candidate) => patternFamily(candidate) === suggestionFamily,
  );
  const coverage = (candidates: CoreRecurrenceSuggestion[]): number => {
    const coveredIds = new Set(candidates.flatMap((candidate) => candidate.transactionIds));
    const covered = params.suggestion.transactionIds.filter((id) => coveredIds.has(id)).length;
    return covered / Math.max(params.suggestion.transactionIds.length, 1);
  };
  if (coverage(sameFamily) > logicalSuggestionOverlapThreshold) return true;
  if (
    cadenceCompatible.length > 1 &&
    coverage(cadenceCompatible) > logicalSuggestionOverlapThreshold
  ) {
    return true;
  }
  if (
    scoped.length > 1 &&
    coverage(scoped) > logicalSuggestionOverlapThreshold
  ) {
    return true;
  }
  return false;
}

export function consolidateCoreRecurrenceSuggestions(
  suggestions: CoreRecurrenceSuggestion[],
  transactionsById: Map<string, RecurrenceTransactionIdentity>,
): CoreRecurrenceSuggestion[] {
  const canonical: CoreRecurrenceSuggestion[] = [];
  const candidates = suggestions
    .filter((suggestion) => !isInternalTransfer(suggestion))
    .sort(
      (left, right) =>
        right.confidenceScore - left.confidenceScore ||
        right.transactionIds.length - left.transactionIds.length ||
        left.id.localeCompare(right.id),
    );
  for (const suggestion of candidates) {
    const equivalentIndexes = canonical
      .map((existing, index) => ({ existing, index }))
      .filter(({ existing }) =>
        areLogicalRecurrenceSuggestionsEquivalent({
          left: suggestion,
          right: existing,
          transactionsById,
        }),
      );
    if (equivalentIndexes.length === 0) {
      canonical.push(suggestion);
      continue;
    }
    const bridgesDistinctSeries = equivalentIndexes.some(({ existing }, leftIndex) =>
      equivalentIndexes.slice(leftIndex + 1).some(({ existing: other }) =>
        !(
          areLogicalRecurrenceSuggestionsEquivalent({
            left: existing,
            right: other,
            transactionsById,
          }) ||
          (existing.patternKind === "recurring_income" &&
            other.patternKind === "recurring_income" &&
            sameEconomicIdentity(existing, other))
        ),
      ),
    );
    if (bridgesDistinctSeries) continue;
    const best = equivalentIndexes.reduce(
      (current, { existing }) =>
        compareRecurrenceSuggestionQuality(current, existing, transactionsById) <= 0
          ? current
          : existing,
      suggestion,
    );
    const equivalentSet = new Set(equivalentIndexes.map(({ index }) => index));
    const remaining = canonical.filter((_item, index) => !equivalentSet.has(index));
    canonical.splice(0, canonical.length, ...remaining, best);
  }

  const consolidated: CoreRecurrenceSuggestion[] = [];
  for (const suggestion of canonical.sort(
    (left, right) =>
      right.confidenceScore - left.confidenceScore ||
      right.transactionIds.length - left.transactionIds.length ||
      left.id.localeCompare(right.id),
  )) {
    if (!isCoveredByBetterCandidates({ suggestion, candidates: consolidated, transactionsById })) {
      consolidated.push(suggestion);
    }
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
  const phase = monthlyPhase(suggestion, transactionsById);
  const identity = [
    "recurrence-logical-v3",
    suggestion.companyId,
    bankAccounts(suggestion.transactionIds, transactionsById),
    suggestion.type,
    patternFamily(suggestion),
    economicDescription(suggestion),
    phase ?? "no-phase",
  ].join("|");
  return `recurrence:v3:${stableHash(identity)}`;
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
  return patternFamily({
    patternKind,
    frequency,
    normalizedDescription: "",
    representativeDescription: "",
  });
}
