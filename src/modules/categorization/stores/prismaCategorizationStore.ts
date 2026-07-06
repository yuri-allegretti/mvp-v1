import {
  CategorizationRuleStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { ConcurrencyError, DomainInvariantError } from "../domain/errors.js";
import {
  categoryAcceptsTransaction,
  PendingTypes,
  type AuditEventRecord,
  type CategoryRecord,
  type CategorizationRuleRecord,
  type CategorizationSuggestionRecord,
  type DecisionMode,
  type JsonObject,
  type PendingItemRecord,
  type PendingStatus,
  type SuggestionStatus,
  type TransactionRecord,
} from "../domain/models.js";
import type {
  ApplyDecisionInput,
  ApplyDecisionResult,
  AuditEventDraft,
  CategorizationStore,
  CreatePendingInput,
  CreateSuggestionInput,
} from "../ports/categorization-store.js";

const categorizationPendingTypes = Object.values(PendingTypes);
const actionablePendingStatuses: Array<"open" | "in_review"> = ["open", "in_review"];

function toJsonObject(value: Prisma.JsonValue): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function toJsonInput(value: JsonObject): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toDecisionMode(value: DecisionMode | null) {
  if (value === null) return null;
  return value === "undefined" ? "undefined_decision" : value;
}

function fromDecisionMode(value: string | null): DecisionMode | null {
  if (value === null) return null;
  return value === "undefined_decision" ? "undefined" : (value as DecisionMode);
}

function mapTransaction(input: {
  id: string;
  companyId: string;
  bankAccountId: string;
  date: Date;
  description: string;
  amount: Prisma.Decimal;
  type: "income" | "expense";
  externalId: string;
  counterpartyName: string | null;
  documentNumber: string | null;
  categoryId: string | null;
  updatedAt: Date;
}): TransactionRecord {
  return {
    id: input.id,
    companyId: input.companyId,
    bankAccountId: input.bankAccountId,
    date: input.date,
    description: input.description,
    amount: input.amount.toNumber(),
    type: input.type,
    externalId: input.externalId,
    counterpartyName: input.counterpartyName,
    documentNumber: input.documentNumber,
    categoryId: input.categoryId,
    updatedAt: input.updatedAt,
  };
}

function mapCategory(input: {
  id: string;
  companyId: string;
  name: string;
  expectedTransactionType: "income" | "expense" | "both";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CategoryRecord {
  return input;
}

function mapRule(input: {
  id: string;
  companyId: string;
  categoryId: string;
  ruleType: string;
  conditions: Prisma.JsonValue;
  priority: number;
  confidence: number;
  status: "active" | "inactive";
  source: string;
  createdFromAuditEventId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): CategorizationRuleRecord {
  return {
    id: input.id,
    companyId: input.companyId,
    categoryId: input.categoryId,
    ruleType: input.ruleType as CategorizationRuleRecord["ruleType"],
    conditions: toJsonObject(input.conditions),
    priority: input.priority,
    confidence: input.confidence,
    active: input.status === CategorizationRuleStatus.active,
    source: input.source as CategorizationRuleRecord["source"],
    createdFromAuditEventId: input.createdFromAuditEventId,
    version: input.version,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function mapSuggestion(input: {
  id: string;
  companyId: string;
  transactionId: string;
  suggestedCategoryId: string;
  ruleId: string | null;
  evaluationId: string;
  deduplicationKey: string;
  score: number;
  confidenceBand: "high" | "medium" | "low";
  origin: string;
  explanation: string;
  evidence: Prisma.JsonValue;
  engineVersion: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): CategorizationSuggestionRecord {
  return {
    id: input.id,
    companyId: input.companyId,
    transactionId: input.transactionId,
    suggestedCategoryId: input.suggestedCategoryId,
    ruleId: input.ruleId,
    evaluationId: input.evaluationId,
    deduplicationKey: input.deduplicationKey,
    score: input.score,
    confidenceBand: input.confidenceBand,
    origin: input.origin as CategorizationSuggestionRecord["origin"],
    explanation: input.explanation,
    evidence: toJsonObject(input.evidence),
    engineVersion: input.engineVersion,
    status: input.status as SuggestionStatus,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function mapPendingItem(input: {
  id: string;
  companyId: string;
  type: string;
  status: string;
  severity: "low" | "medium" | "high" | "critical";
  transactionId: string | null;
  suggestionId: string | null;
  deduplicationKey: string;
  title: string;
  description: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
}): PendingItemRecord {
  return {
    id: input.id,
    companyId: input.companyId,
    type: input.type,
    status: input.status as PendingStatus,
    severity: input.severity,
    transactionId: input.transactionId,
    suggestionId: input.suggestionId,
    deduplicationKey: input.deduplicationKey,
    title: input.title,
    description: input.description,
    metadata: toJsonObject(input.metadata),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    resolvedAt: input.resolvedAt,
    resolvedByUserId: input.resolvedByUserId,
  };
}

function mapAuditEvent(input: {
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
  decisionMode: string | null;
  reason: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}): AuditEventRecord {
  return {
    id: input.id,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    transactionId: input.transactionId,
    suggestionId: input.suggestionId,
    ruleId: input.ruleId,
    previousCategoryId: input.previousCategoryId,
    finalCategoryId: input.finalCategoryId,
    decisionMode: fromDecisionMode(input.decisionMode),
    reason: input.reason,
    metadata: toJsonObject(input.metadata),
    createdAt: input.createdAt,
  };
}

function auditData(input: AuditEventDraft): Prisma.AuditEventUncheckedCreateInput {
  return {
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    transactionId: input.transactionId,
    suggestionId: input.suggestionId,
    ruleId: input.ruleId,
    previousCategoryId: input.previousCategoryId,
    finalCategoryId: input.finalCategoryId,
    decisionMode: toDecisionMode(input.decisionMode),
    reason: input.reason,
    metadata: toJsonInput(input.metadata),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

export class PrismaCategorizationStore implements CategorizationStore {
  constructor(private readonly client: PrismaClient = prisma) {}

  async getTransaction(
    companyId: string,
    transactionId: string,
  ): Promise<TransactionRecord | null> {
    const transaction = await this.client.transaction.findUnique({
      where: {
        id_companyId: {
          id: transactionId,
          companyId,
        },
      },
    });
    return transaction ? mapTransaction(transaction) : null;
  }

  async getCategory(companyId: string, categoryId: string): Promise<CategoryRecord | null> {
    const category = await this.client.category.findUnique({
      where: {
        id_companyId: {
          id: categoryId,
          companyId,
        },
      },
    });
    return category ? mapCategory(category) : null;
  }

  async listActiveRules(companyId: string): Promise<CategorizationRuleRecord[]> {
    const rules = await this.client.categorizationRule.findMany({
      where: {
        companyId,
        status: "active",
      },
      orderBy: [{ priority: "desc" }, { confidence: "desc" }],
    });
    return rules.map(mapRule);
  }

  async getSuggestion(
    companyId: string,
    suggestionId: string,
  ): Promise<CategorizationSuggestionRecord | null> {
    const suggestion = await this.client.categorizationSuggestion.findUnique({
      where: {
        id_companyId: {
          id: suggestionId,
          companyId,
        },
      },
    });
    return suggestion ? mapSuggestion(suggestion) : null;
  }

  async listSuggestionsByEvaluation(
    companyId: string,
    transactionId: string,
    evaluationId: string,
  ): Promise<CategorizationSuggestionRecord[]> {
    const suggestions = await this.client.categorizationSuggestion.findMany({
      where: {
        companyId,
        transactionId,
        evaluationId,
      },
      orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    });
    return suggestions.map(mapSuggestion);
  }

  async createSuggestion(input: CreateSuggestionInput): Promise<CategorizationSuggestionRecord> {
    const existing = await this.client.categorizationSuggestion.findUnique({
      where: { deduplicationKey: input.deduplicationKey },
    });
    if (existing) {
      if (
        existing.companyId !== input.companyId ||
        existing.transactionId !== input.transactionId
      ) {
        throw new DomainInvariantError("Suggestion deduplication key belongs to another scope");
      }
      return mapSuggestion(existing);
    }

    try {
      const created = await this.client.categorizationSuggestion.create({
        data: {
          companyId: input.companyId,
          transactionId: input.transactionId,
          suggestedCategoryId: input.suggestedCategoryId,
          ruleId: input.ruleId,
          evaluationId: input.evaluationId,
          deduplicationKey: input.deduplicationKey,
          score: input.score,
          confidenceBand: input.confidenceBand,
          origin: input.origin,
          explanation: input.explanation,
          evidence: toJsonInput(input.evidence),
          engineVersion: input.engineVersion,
        },
      });
      return mapSuggestion(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const duplicate = await this.client.categorizationSuggestion.findUniqueOrThrow({
        where: { deduplicationKey: input.deduplicationKey },
      });
      if (duplicate.companyId !== input.companyId) {
        throw new DomainInvariantError("Suggestion deduplication key belongs to another company");
      }
      return mapSuggestion(duplicate);
    }
  }

  async createPendingIfAbsent(
    input: CreatePendingInput,
  ): Promise<{ item: PendingItemRecord; created: boolean }> {
    const existing = await this.client.pendingItem.findFirst({
      where: {
        companyId: input.companyId,
        deduplicationKey: input.deduplicationKey,
        status: { in: actionablePendingStatuses },
      },
    });
    if (existing) return { item: mapPendingItem(existing), created: false };

    try {
      const created = await this.client.pendingItem.create({
        data: {
          companyId: input.companyId,
          type: input.type,
          severity: input.severity,
          transactionId: input.transactionId,
          suggestionId: input.suggestionId,
          deduplicationKey: input.deduplicationKey,
          title: input.title,
          description: input.description,
          metadata: toJsonInput(input.metadata),
        },
      });
      return { item: mapPendingItem(created), created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const duplicate = await this.client.pendingItem.findFirstOrThrow({
        where: {
          companyId: input.companyId,
          deduplicationKey: input.deduplicationKey,
          status: { in: actionablePendingStatuses },
        },
      });
      return { item: mapPendingItem(duplicate), created: false };
    }
  }

  async createAuditEvent(input: AuditEventDraft): Promise<AuditEventRecord> {
    const created = await this.client.auditEvent.create({ data: auditData(input) });
    return mapAuditEvent(created);
  }

  async applyDecision(input: ApplyDecisionInput): Promise<ApplyDecisionResult> {
    return this.client.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: {
          id_companyId: {
            id: input.transactionId,
            companyId: input.companyId,
          },
        },
      });
      if (!transaction) {
        throw new DomainInvariantError("Decision and transaction must belong to the same company");
      }
      if (transaction.categoryId !== input.expectedPreviousCategoryId) {
        throw new ConcurrencyError("Transaction category changed during decision");
      }

      if (
        input.audit.companyId !== input.companyId ||
        input.audit.transactionId !== input.transactionId
      ) {
        throw new DomainInvariantError("Audit event must describe the same company and transaction");
      }

      if (input.finalCategoryId) {
        const category = await tx.category.findUnique({
          where: {
            id_companyId: {
              id: input.finalCategoryId,
              companyId: input.companyId,
            },
          },
        });
        if (!category) {
          throw new DomainInvariantError("Decision and category must belong to the same company");
        }
        if (!category.isActive) throw new DomainInvariantError("Inactive category cannot be applied");
        if (!categoryAcceptsTransaction(category.expectedTransactionType, transaction.type)) {
          throw new DomainInvariantError("Category transaction type is incompatible");
        }
      }

      const suggestion = input.suggestionId
        ? await tx.categorizationSuggestion.findUnique({
            where: {
              id_companyId: {
                id: input.suggestionId,
                companyId: input.companyId,
              },
            },
          })
        : null;
      if (
        input.suggestionId &&
        (!suggestion ||
          suggestion.transactionId !== input.transactionId ||
          suggestion.companyId !== input.companyId)
      ) {
        throw new DomainInvariantError(
          "Decision and suggestion must belong to the same transaction and company",
        );
      }

      if (suggestion && input.suggestionStatus) {
        const suggestionUpdate = await tx.categorizationSuggestion.updateMany({
          where: {
            id: suggestion.id,
            companyId: input.companyId,
            transactionId: input.transactionId,
            status: "generated",
          },
          data: {
            status: input.suggestionStatus,
          },
        });
        if (suggestionUpdate.count !== 1) {
          throw new ConcurrencyError("Suggestion was already decided");
        }

        if (input.suggestionStatus !== "rejected") {
          await tx.categorizationSuggestion.updateMany({
            where: {
              companyId: input.companyId,
              transactionId: input.transactionId,
              evaluationId: suggestion.evaluationId,
              id: { not: suggestion.id },
              status: "generated",
            },
            data: {
              status: "superseded",
            },
          });
        }
      }

      const transactionUpdate = await tx.transaction.updateMany({
        where: {
          id: input.transactionId,
          companyId: input.companyId,
          categoryId: input.expectedPreviousCategoryId,
        },
        data: {
          categoryId: input.finalCategoryId,
        },
      });
      if (transactionUpdate.count !== 1) {
        throw new ConcurrencyError("Transaction category changed during decision");
      }

      const pendingItems = await tx.pendingItem.findMany({
        where: {
          companyId: input.companyId,
          transactionId: input.transactionId,
          type: { in: categorizationPendingTypes },
          status: { in: actionablePendingStatuses },
        },
      });

      const now = new Date();
      if (pendingItems.length > 0) {
        await tx.pendingItem.updateMany({
          where: {
            id: { in: pendingItems.map((item) => item.id) },
            companyId: input.companyId,
            status: { in: actionablePendingStatuses },
          },
          data: {
            status: input.pendingFinalStatus,
            resolvedAt: now,
            resolvedByUserId: input.actorUserId,
          },
        });
      }

      const auditEvent = await tx.auditEvent.create({
        data: auditData({
          ...input.audit,
          previousCategoryId: transaction.categoryId,
          finalCategoryId: input.finalCategoryId,
        }),
      });

      if (pendingItems.length > 0) {
        await tx.auditEvent.createMany({
          data: pendingItems.map((pending) => ({
            companyId: input.companyId,
            actorUserId: input.actorUserId,
            entityType: "PendingItem",
            entityId: pending.id,
            action:
              input.pendingFinalStatus === "dismissed"
                ? "pending.dismissed"
                : "pending.resolved",
            transactionId: input.transactionId,
            suggestionId: pending.suggestionId,
            ruleId: input.audit.ruleId,
            previousCategoryId: transaction.categoryId,
            finalCategoryId: input.finalCategoryId,
            decisionMode: toDecisionMode(input.audit.decisionMode),
            reason: input.audit.reason,
            metadata: toJsonInput({
              pendingType: pending.type,
              previousStatus: pending.status,
              finalStatus: input.pendingFinalStatus,
            }),
          })),
        });
      }

      const updatedTransaction = await tx.transaction.findUniqueOrThrow({
        where: {
          id_companyId: {
            id: input.transactionId,
            companyId: input.companyId,
          },
        },
      });

      return {
        transaction: mapTransaction(updatedTransaction),
        auditEvent: mapAuditEvent(auditEvent),
      };
    });
  }
}
