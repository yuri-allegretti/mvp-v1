export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type TransactionType = "income" | "expense";
export type ExpectedTransactionType = TransactionType | "both";
export type ConfidenceBand = "high" | "medium" | "low";
export type SuggestionOrigin =
  | "manual_rule"
  | "document_rule"
  | "counterparty_rule"
  | "description_rule"
  | "correction_history"
  | "recurrence_context"
  | "fallback";
export type SuggestionStatus =
  | "generated"
  | "applied"
  | "accepted"
  | "corrected"
  | "rejected"
  | "superseded";
export type RuleType =
  | "document_equals"
  | "counterparty_equals"
  | "counterparty_contains"
  | "description_contains"
  | "description_equals"
  | "amount_range"
  | "counterparty_and_amount_range";
export type RuleSource = "manual" | "correction_history" | "system";
export type PendingStatus = "open" | "in_review" | "resolved" | "dismissed";
export type PendingSeverity = "low" | "medium" | "high" | "critical";
export type DecisionMode = "automatic" | "accepted" | "corrected" | "rejected" | "undefined";

export const PendingTypes = {
  categorizationReview: "categorization_review",
  categorizationLowConfidence: "categorization_low_confidence",
  categorizationConflict: "categorization_conflict",
  uncategorizedTransaction: "uncategorized_transaction",
} as const;

export type CategorizationPendingType = (typeof PendingTypes)[keyof typeof PendingTypes];

export interface TransactionRecord {
  id: string;
  companyId: string;
  bankAccountId: string;
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  externalId: string;
  counterpartyName: string | null;
  documentNumber: string | null;
  categoryId: string | null;
  updatedAt: Date;
}

export interface CategoryRecord {
  id: string;
  companyId: string;
  name: string;
  expectedTransactionType: ExpectedTransactionType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategorizationRuleRecord {
  id: string;
  companyId: string;
  categoryId: string;
  ruleType: RuleType;
  conditions: JsonObject;
  priority: number;
  confidence: number;
  active: boolean;
  source: RuleSource;
  createdFromAuditEventId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategorizationSuggestionRecord {
  id: string;
  companyId: string;
  transactionId: string;
  suggestedCategoryId: string;
  ruleId: string | null;
  evaluationId: string;
  deduplicationKey: string;
  score: number;
  confidenceBand: ConfidenceBand;
  origin: SuggestionOrigin;
  explanation: string;
  evidence: JsonObject;
  engineVersion: string;
  status: SuggestionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingItemRecord {
  id: string;
  companyId: string;
  type: string;
  status: PendingStatus;
  severity: PendingSeverity;
  transactionId: string | null;
  suggestionId: string | null;
  deduplicationKey: string;
  title: string;
  description: string;
  metadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
}

export interface AuditEventRecord {
  id: string;
  companyId: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  transactionId: string | null;
  suggestionId: string | null;
  ruleId: string | null;
  previousCategoryId: string | null;
  finalCategoryId: string | null;
  decisionMode: DecisionMode | null;
  reason: string | null;
  metadata: JsonObject;
  createdAt: Date;
}

export interface SuggestionCandidate {
  categoryId: string;
  ruleId: string;
  score: number;
  origin: SuggestionOrigin;
  explanation: string;
  evidence: JsonObject;
  priority: number;
}

export interface RuleEvaluationResult {
  candidates: SuggestionCandidate[];
  hasConflict: boolean;
}

export function confidenceBandFor(score: number): ConfidenceBand {
  if (score >= 90) return "high";
  if (score >= 60) return "medium";
  return "low";
}

export function categoryAcceptsTransaction(
  expectedType: ExpectedTransactionType,
  transactionType: TransactionType,
): boolean {
  return expectedType === "both" || expectedType === transactionType;
}
