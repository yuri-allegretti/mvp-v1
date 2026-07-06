import type {
  AuditEventRecord,
  CategoryRecord,
  CategorizationRuleRecord,
  CategorizationSuggestionRecord,
  DecisionMode,
  JsonObject,
  PendingItemRecord,
  PendingSeverity,
  SuggestionOrigin,
  SuggestionStatus,
  TransactionRecord,
} from "../domain/models.js";

export interface CreateSuggestionInput {
  companyId: string;
  transactionId: string;
  suggestedCategoryId: string;
  ruleId: string | null;
  evaluationId: string;
  deduplicationKey: string;
  score: number;
  confidenceBand: "high" | "medium" | "low";
  origin: SuggestionOrigin;
  explanation: string;
  evidence: JsonObject;
  engineVersion: string;
}

export interface CreatePendingInput {
  companyId: string;
  type: string;
  severity: PendingSeverity;
  transactionId: string | null;
  suggestionId: string | null;
  deduplicationKey: string;
  title: string;
  description: string;
  metadata: JsonObject;
}

export interface AuditEventDraft {
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
}

export interface ApplyDecisionInput {
  companyId: string;
  transactionId: string;
  expectedPreviousCategoryId: string | null;
  finalCategoryId: string | null;
  suggestionId: string | null;
  suggestionStatus: SuggestionStatus | null;
  actorUserId: string | null;
  pendingFinalStatus: "resolved" | "dismissed";
  audit: AuditEventDraft;
}

export interface ApplyDecisionResult {
  transaction: TransactionRecord;
  auditEvent: AuditEventRecord;
}

export interface CategorizationStore {
  getTransaction(companyId: string, transactionId: string): Promise<TransactionRecord | null>;
  getCategory(companyId: string, categoryId: string): Promise<CategoryRecord | null>;
  listActiveRules(companyId: string): Promise<CategorizationRuleRecord[]>;
  getSuggestion(companyId: string, suggestionId: string): Promise<CategorizationSuggestionRecord | null>;
  listSuggestionsByEvaluation(
    companyId: string,
    transactionId: string,
    evaluationId: string,
  ): Promise<CategorizationSuggestionRecord[]>;
  createSuggestion(input: CreateSuggestionInput): Promise<CategorizationSuggestionRecord>;
  createPendingIfAbsent(
    input: CreatePendingInput,
  ): Promise<{ item: PendingItemRecord; created: boolean }>;
  createAuditEvent(input: AuditEventDraft): Promise<AuditEventRecord>;

  /**
   * This is the persistence boundary for a decision. A production adapter must
   * update the external Transaction, suggestion, related pending items and
   * AuditEvents (including one resolution event per pending item) in one
   * database transaction.
   */
  applyDecision(input: ApplyDecisionInput): Promise<ApplyDecisionResult>;
}
