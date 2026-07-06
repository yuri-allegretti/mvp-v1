import { createHash } from "node:crypto";
import { NotFoundError } from "../domain/errors.js";
import {
  categoryAcceptsTransaction,
  confidenceBandFor,
  type CategorizationSuggestionRecord,
  type PendingItemRecord,
  type TransactionRecord,
} from "../domain/models.js";
import type { CategorizationStore } from "../ports/categorization-store.js";
import { CategorizationDecisionService } from "./categorization-decision-service.js";
import { PendingGenerationService } from "./pending-generation-service.js";
import { RuleEvaluationService } from "./rule-evaluation-service.js";

export type CategorizationEngineResult =
  | { outcome: "already_categorized"; transaction: TransactionRecord }
  | { outcome: "automatically_applied"; transaction: TransactionRecord; suggestion: CategorizationSuggestionRecord }
  | { outcome: "pending"; suggestions: CategorizationSuggestionRecord[]; pendingItem: PendingItemRecord };

export class CategorizationEngine {
  constructor(
    private readonly store: CategorizationStore,
    private readonly ruleEvaluationService: RuleEvaluationService,
    private readonly decisionService: CategorizationDecisionService,
    private readonly pendingService: PendingGenerationService,
    private readonly engineVersion = "categorization-engine-v1",
  ) {}

  async process(companyId: string, transactionId: string): Promise<CategorizationEngineResult> {
    const transaction = await this.store.getTransaction(companyId, transactionId);
    if (!transaction) throw new NotFoundError("Transaction", transactionId);
    if (transaction.categoryId) return { outcome: "already_categorized", transaction };

    const rules = await this.store.listActiveRules(companyId);
    const evaluation = this.ruleEvaluationService.evaluate(transaction, rules);
    const evaluationId = this.evaluationId(transaction, rules);

    if (evaluation.candidates.length === 0) {
      const pendingItem = await this.pendingService.createForUncategorized(transaction);
      return { outcome: "pending", suggestions: [], pendingItem };
    }

    const suggestions: CategorizationSuggestionRecord[] = [];
    const conflictingCategoryIds = evaluation.candidates.map((candidate) => candidate.categoryId);
    for (const candidate of evaluation.candidates) {
      const evidence = evaluation.hasConflict
        ? {
            ...candidate.evidence,
            conflict: true,
            conflictingCategoryIds,
          }
        : candidate.evidence;
      const explanation = evaluation.hasConflict
        ? `${candidate.explanation} Conflito com outra categoria candidata; aplicação automática bloqueada.`
        : candidate.explanation;
      suggestions.push(
        await this.store.createSuggestion({
          companyId,
          transactionId,
          suggestedCategoryId: candidate.categoryId,
          ruleId: candidate.ruleId,
          evaluationId,
          deduplicationKey: `${evaluationId}:${candidate.categoryId}`,
          score: candidate.score,
          confidenceBand: confidenceBandFor(candidate.score),
          origin: candidate.origin,
          explanation,
          evidence,
          engineVersion: this.engineVersion,
        }),
      );
    }

    if (evaluation.hasConflict) {
      const pendingItem = await this.pendingService.createForConflict(transaction, suggestions);
      return { outcome: "pending", suggestions, pendingItem };
    }

    const suggestion = suggestions[0];
    if (!suggestion) throw new Error("Evaluation candidate did not produce a suggestion");
    const category = await this.store.getCategory(companyId, suggestion.suggestedCategoryId);
    if (!category || !category.isActive) {
      const pendingItem = await this.pendingService.createForInvalidCategory(
        transaction,
        suggestion,
        "A categoria sugerida está inativa ou indisponível.",
      );
      return { outcome: "pending", suggestions, pendingItem };
    }
    if (!categoryAcceptsTransaction(category.expectedTransactionType, transaction.type)) {
      const pendingItem = await this.pendingService.createForInvalidCategory(
        transaction,
        suggestion,
        "A categoria sugerida é incompatível com o tipo da transação.",
      );
      return { outcome: "pending", suggestions, pendingItem };
    }

    if (suggestion.confidenceBand === "high") {
      const updated = await this.decisionService.applyAutomatically(companyId, transactionId, suggestion.id);
      return { outcome: "automatically_applied", transaction: updated, suggestion };
    }

    const pendingItem =
      suggestion.confidenceBand === "medium"
        ? await this.pendingService.createForMediumConfidence(transaction, suggestion)
        : await this.pendingService.createForLowConfidence(transaction, suggestion);
    return { outcome: "pending", suggestions, pendingItem };
  }

  private evaluationId(
    transaction: TransactionRecord,
    rules: Awaited<ReturnType<CategorizationStore["listActiveRules"]>>,
  ): string {
    const input = JSON.stringify({
      engineVersion: this.engineVersion,
      transaction: {
        id: transaction.id,
        companyId: transaction.companyId,
        date: transaction.date.toISOString(),
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        counterpartyName: transaction.counterpartyName,
        documentNumber: transaction.documentNumber,
      },
      rules: rules
        .map((rule) => ({ id: rule.id, version: rule.version, priority: rule.priority, confidence: rule.confidence }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    });
    return createHash("sha256").update(input).digest("hex");
  }
}
