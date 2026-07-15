import type {
  CategorizationSuggestionRecord,
  JsonObject,
  PendingItemRecord,
  TransactionRecord,
} from "../domain/models";
import { PendingTypes } from "../domain/models";
import type { CategorizationStore, CreatePendingInput } from "../ports/categorization-store";
import { AuditService } from "./audit-service";

export class PendingGenerationService {
  constructor(
    private readonly store: CategorizationStore,
    private readonly auditService: AuditService,
  ) {}

  createForMediumConfidence(
    transaction: TransactionRecord,
    suggestion: CategorizationSuggestionRecord,
  ): Promise<PendingItemRecord> {
    return this.create({
      transaction,
      suggestion,
      type: PendingTypes.categorizationReview,
      severity: "medium",
      title: "Revisar categorização sugerida",
      description: `Sugestão com confiança média (${suggestion.score}).`,
      metadata: { score: suggestion.score, confidenceBand: suggestion.confidenceBand },
    });
  }

  createForLowConfidence(
    transaction: TransactionRecord,
    suggestion: CategorizationSuggestionRecord,
  ): Promise<PendingItemRecord> {
    return this.create({
      transaction,
      suggestion,
      type: PendingTypes.categorizationLowConfidence,
      severity: "high",
      title: "Categorizar transação de baixa confiança",
      description: `Sugestão com baixa confiança (${suggestion.score}).`,
      metadata: { score: suggestion.score, confidenceBand: suggestion.confidenceBand },
    });
  }

  createForConflict(
    transaction: TransactionRecord,
    suggestions: CategorizationSuggestionRecord[],
  ): Promise<PendingItemRecord> {
    const primary = suggestions[0] ?? null;
    return this.create({
      transaction,
      suggestion: primary,
      type: PendingTypes.categorizationConflict,
      severity: "high",
      title: "Resolver conflito de categorização",
      description: "Regras aplicáveis sugeriram categorias diferentes.",
      metadata: {
        suggestionIds: suggestions.map((suggestion) => suggestion.id),
        categoryIds: suggestions.map((suggestion) => suggestion.suggestedCategoryId),
      },
    });
  }

  createForUncategorized(transaction: TransactionRecord): Promise<PendingItemRecord> {
    return this.create({
      transaction,
      suggestion: null,
      type: PendingTypes.uncategorizedTransaction,
      severity: "medium",
      title: "Categorizar transação",
      description: "Nenhuma regra aplicável produziu uma categoria candidata.",
      metadata: { score: 0 },
    });
  }

  createForInvalidCategory(
    transaction: TransactionRecord,
    suggestion: CategorizationSuggestionRecord,
    reason: string,
  ): Promise<PendingItemRecord> {
    return this.create({
      transaction,
      suggestion,
      type: PendingTypes.categorizationReview,
      severity: "high",
      title: "Revisar categoria indisponível",
      description: reason,
      metadata: { score: suggestion.score, reason },
    });
  }

  private async create(input: {
    transaction: TransactionRecord;
    suggestion: CategorizationSuggestionRecord | null;
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
    metadata: JsonObject;
  }): Promise<PendingItemRecord> {
    const deduplicationKey = [input.transaction.companyId, input.transaction.id, input.type].join(":");
    const pendingInput: CreatePendingInput = {
      companyId: input.transaction.companyId,
      type: input.type,
      severity: input.severity,
      transactionId: input.transaction.id,
      suggestionId: input.suggestion?.id ?? null,
      deduplicationKey,
      title: input.title,
      description: input.description,
      metadata: input.metadata,
    };
    const result = await this.store.createPendingIfAbsent(pendingInput);

    if (result.created) {
      await this.auditService.record({
        companyId: input.transaction.companyId,
        actorUserId: null,
        entityType: "PendingItem",
        entityId: result.item.id,
        action: "pending.created",
        transactionId: input.transaction.id,
        suggestionId: input.suggestion?.id ?? null,
        ruleId: null,
        previousCategoryId: input.transaction.categoryId,
        finalCategoryId: input.transaction.categoryId,
        decisionMode: null,
        reason: input.type,
        metadata: input.metadata,
      });
    }

    return result.item;
  }
}
