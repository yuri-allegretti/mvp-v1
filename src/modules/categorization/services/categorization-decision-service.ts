import { DomainInvariantError, NotFoundError } from "../domain/errors.js";
import {
  categoryAcceptsTransaction,
  type CategoryRecord,
  type CategorizationSuggestionRecord,
  type DecisionMode,
  type JsonObject,
  type SuggestionStatus,
  type TransactionRecord,
} from "../domain/models.js";
import type { CategorizationStore } from "../ports/categorization-store.js";
import { AuditService } from "./audit-service.js";

export class CategorizationDecisionService {
  constructor(
    private readonly store: CategorizationStore,
    private readonly auditService: AuditService,
  ) {}

  async applyAutomatically(
    companyId: string,
    transactionId: string,
    suggestionId: string,
  ): Promise<TransactionRecord> {
    const context = await this.loadSuggestionContext(companyId, transactionId, suggestionId);
    if (context.suggestion.confidenceBand !== "high" || context.suggestion.score < 90) {
      throw new DomainInvariantError("Only high-confidence suggestions can be applied automatically");
    }
    if (context.suggestion.status !== "generated") {
      throw new DomainInvariantError("Only generated suggestions can be applied automatically");
    }

    const siblings = await this.store.listSuggestionsByEvaluation(
      companyId,
      transactionId,
      context.suggestion.evaluationId,
    );
    if (new Set(siblings.map((item) => item.suggestedCategoryId)).size > 1) {
      throw new DomainInvariantError("Conflicting categories block automatic application");
    }

    return this.apply({
      ...context,
      actorUserId: null,
      decisionMode: "automatic",
      suggestionStatus: "applied",
      reason: null,
      action: "categorization.auto_applied",
    });
  }

  async acceptSuggestion(input: {
    companyId: string;
    transactionId: string;
    suggestionId: string;
    actorUserId: string;
    reason?: string;
  }): Promise<TransactionRecord> {
    this.requireActor(input.actorUserId);
    const context = await this.loadSuggestionContext(
      input.companyId,
      input.transactionId,
      input.suggestionId,
    );
    return this.apply({
      ...context,
      actorUserId: input.actorUserId,
      decisionMode: "accepted",
      suggestionStatus: "accepted",
      reason: input.reason ?? null,
      action: "categorization.suggestion_accepted",
    });
  }

  async correctCategory(input: {
    companyId: string;
    transactionId: string;
    finalCategoryId: string;
    actorUserId: string;
    reason: string;
    suggestionId?: string;
  }): Promise<TransactionRecord> {
    this.requireActor(input.actorUserId);
    if (!input.reason.trim()) throw new DomainInvariantError("Correction reason is required");

    const transaction = await this.requireTransaction(input.companyId, input.transactionId);
    const category = await this.requireApplicableCategory(
      input.companyId,
      input.finalCategoryId,
      transaction,
    );
    const suggestion = input.suggestionId
      ? await this.requireSuggestion(input.companyId, input.transactionId, input.suggestionId)
      : null;

    return this.apply({
      transaction,
      category,
      suggestion,
      actorUserId: input.actorUserId,
      decisionMode: "corrected",
      suggestionStatus: suggestion ? "corrected" : null,
      reason: input.reason,
      action: "categorization.corrected",
    });
  }

  async rejectSuggestion(input: {
    companyId: string;
    transactionId: string;
    suggestionId: string;
    actorUserId: string;
    reason: string;
  }): Promise<TransactionRecord> {
    this.requireActor(input.actorUserId);
    if (!input.reason.trim()) throw new DomainInvariantError("Rejection reason is required");

    const transaction = await this.requireTransaction(input.companyId, input.transactionId);
    const suggestion = await this.requireSuggestion(
      input.companyId,
      input.transactionId,
      input.suggestionId,
    );

    const audit = this.auditService.prepare({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      entityType: "Transaction",
      entityId: transaction.id,
      action: "categorization.suggestion_rejected",
      transactionId: transaction.id,
      suggestionId: suggestion.id,
      ruleId: suggestion.ruleId,
      previousCategoryId: transaction.categoryId,
      finalCategoryId: transaction.categoryId,
      decisionMode: "rejected",
      reason: input.reason,
      metadata: this.suggestionMetadata(suggestion),
    });
    const result = await this.store.applyDecision({
      companyId: input.companyId,
      transactionId: transaction.id,
      expectedPreviousCategoryId: transaction.categoryId,
      finalCategoryId: transaction.categoryId,
      suggestionId: suggestion.id,
      suggestionStatus: "rejected",
      actorUserId: input.actorUserId,
      pendingFinalStatus: "dismissed",
      audit,
    });
    return result.transaction;
  }

  async markUndefined(input: {
    companyId: string;
    transactionId: string;
    actorUserId: string;
    reason: string;
    suggestionId?: string;
  }): Promise<TransactionRecord> {
    this.requireActor(input.actorUserId);
    if (!input.reason.trim()) throw new DomainInvariantError("Undefined reason is required");
    const transaction = await this.requireTransaction(input.companyId, input.transactionId);
    const suggestion = input.suggestionId
      ? await this.requireSuggestion(input.companyId, input.transactionId, input.suggestionId)
      : null;

    const audit = this.auditService.prepare({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      entityType: "Transaction",
      entityId: transaction.id,
      action: "categorization.marked_undefined",
      transactionId: transaction.id,
      suggestionId: suggestion?.id ?? null,
      ruleId: suggestion?.ruleId ?? null,
      previousCategoryId: transaction.categoryId,
      finalCategoryId: null,
      decisionMode: "undefined",
      reason: input.reason,
      metadata: suggestion ? this.suggestionMetadata(suggestion) : {},
    });
    const result = await this.store.applyDecision({
      companyId: input.companyId,
      transactionId: transaction.id,
      expectedPreviousCategoryId: transaction.categoryId,
      finalCategoryId: null,
      suggestionId: suggestion?.id ?? null,
      suggestionStatus: suggestion ? "rejected" : null,
      actorUserId: input.actorUserId,
      pendingFinalStatus: "resolved",
      audit,
    });
    return result.transaction;
  }

  private async loadSuggestionContext(
    companyId: string,
    transactionId: string,
    suggestionId: string,
  ): Promise<{
    transaction: TransactionRecord;
    category: CategoryRecord;
    suggestion: CategorizationSuggestionRecord;
  }> {
    const transaction = await this.requireTransaction(companyId, transactionId);
    const suggestion = await this.requireSuggestion(companyId, transactionId, suggestionId);
    const category = await this.requireApplicableCategory(
      companyId,
      suggestion.suggestedCategoryId,
      transaction,
    );
    return { transaction, category, suggestion };
  }

  private async apply(input: {
    transaction: TransactionRecord;
    category: CategoryRecord;
    suggestion: CategorizationSuggestionRecord | null;
    actorUserId: string | null;
    decisionMode: Exclude<DecisionMode, "rejected" | "undefined">;
    suggestionStatus: SuggestionStatus | null;
    reason: string | null;
    action: string;
  }): Promise<TransactionRecord> {
    const audit = this.auditService.prepare({
      companyId: input.transaction.companyId,
      actorUserId: input.actorUserId,
      entityType: "Transaction",
      entityId: input.transaction.id,
      action: input.action,
      transactionId: input.transaction.id,
      suggestionId: input.suggestion?.id ?? null,
      ruleId: input.suggestion?.ruleId ?? null,
      previousCategoryId: input.transaction.categoryId,
      finalCategoryId: input.category.id,
      decisionMode: input.decisionMode,
      reason: input.reason,
      metadata: input.suggestion ? this.suggestionMetadata(input.suggestion) : {},
    });
    const result = await this.store.applyDecision({
      companyId: input.transaction.companyId,
      transactionId: input.transaction.id,
      expectedPreviousCategoryId: input.transaction.categoryId,
      finalCategoryId: input.category.id,
      suggestionId: input.suggestion?.id ?? null,
      suggestionStatus: input.suggestionStatus,
      actorUserId: input.actorUserId,
      pendingFinalStatus: "resolved",
      audit,
    });
    return result.transaction;
  }

  private async requireTransaction(companyId: string, transactionId: string): Promise<TransactionRecord> {
    const transaction = await this.store.getTransaction(companyId, transactionId);
    if (!transaction) throw new NotFoundError("Transaction", transactionId);
    return transaction;
  }

  private async requireSuggestion(
    companyId: string,
    transactionId: string,
    suggestionId: string,
  ): Promise<CategorizationSuggestionRecord> {
    const suggestion = await this.store.getSuggestion(companyId, suggestionId);
    if (!suggestion || suggestion.transactionId !== transactionId) {
      throw new NotFoundError("CategorizationSuggestion", suggestionId);
    }
    return suggestion;
  }

  private async requireApplicableCategory(
    companyId: string,
    categoryId: string,
    transaction: TransactionRecord,
  ): Promise<CategoryRecord> {
    const category = await this.store.getCategory(companyId, categoryId);
    if (!category) throw new NotFoundError("Category", categoryId);
    if (!category.isActive) throw new DomainInvariantError("Inactive category cannot be applied");
    if (!categoryAcceptsTransaction(category.expectedTransactionType, transaction.type)) {
      throw new DomainInvariantError("Category transaction type is incompatible");
    }
    return category;
  }

  private requireActor(actorUserId: string): void {
    if (!actorUserId.trim()) throw new DomainInvariantError("actorUserId is required");
  }

  private suggestionMetadata(suggestion: CategorizationSuggestionRecord): JsonObject {
    return {
      score: suggestion.score,
      confidenceBand: suggestion.confidenceBand,
      origin: suggestion.origin,
      engineVersion: suggestion.engineVersion,
      evaluationId: suggestion.evaluationId,
    };
  }
}
