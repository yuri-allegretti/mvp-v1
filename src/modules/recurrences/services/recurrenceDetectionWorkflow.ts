import type {
  Prisma,
  PrismaClient,
  RecurrenceSuggestion as PersistedRecurrenceSuggestion,
  Transaction,
} from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { detectRecurrences } from "../core/service/recurrenceDetectionService.ts";
import type { RecurrenceSuggestion as CoreRecurrenceSuggestion } from "../core/types.ts";
import {
  buildRecurrenceAdapterEvidence,
  transactionToRecurrenceInput,
} from "../adapters/transactionToRecurrenceInput";

const recurrenceApprovalType = "recurrence_approval";

export interface DetectRecurrencesForCompanyInput {
  companyId: string;
  bankAccountId?: string;
  transactionIds?: string[];
}

export interface RecurrenceDetectionWorkflowResult {
  processedTransactions: number;
  detectedSuggestions: number;
  suggestionsCreated: number;
  pendingCreated: number;
  suggestions: PersistedRecurrenceSuggestion[];
}

function dateOnly(value: string | undefined): Date | undefined {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function deduplicationKey(suggestion: CoreRecurrenceSuggestion): string {
  return suggestion.id;
}

function pendingDeduplicationKey(companyId: string, suggestionId: string): string {
  return [companyId, recurrenceApprovalType, suggestionId].join(":");
}

function evidenceForSuggestion(params: {
  suggestion: CoreRecurrenceSuggestion;
  transactions: Transaction[];
}): Prisma.InputJsonValue {
  const adapterEvidence = buildRecurrenceAdapterEvidence(params.transactions);
  return toJsonInput({
    ...params.suggestion.evidence,
    detectorSuggestionId: params.suggestion.id,
    transactionIds: params.suggestion.transactionIds,
    adapter: adapterEvidence,
  });
}

async function existingCategoryId(
  client: Prisma.TransactionClient,
  companyId: string,
  categoryId: string | undefined,
): Promise<string | null> {
  if (!categoryId) return null;
  const category = await client.category.findUnique({
    where: {
      id_companyId: {
        id: categoryId,
        companyId,
      },
    },
    select: { id: true },
  });
  return category?.id ?? null;
}

async function persistSuggestion(params: {
  client: Prisma.TransactionClient;
  suggestion: CoreRecurrenceSuggestion;
  companyId: string;
  transactionsById: Map<string, Transaction>;
}): Promise<{ suggestion: PersistedRecurrenceSuggestion; created: boolean; pendingCreated: boolean }> {
  const transactions = params.suggestion.transactionIds
    .map((transactionId) => params.transactionsById.get(transactionId))
    .filter((transaction): transaction is Transaction => Boolean(transaction));

  if (transactions.length !== params.suggestion.transactionIds.length) {
    throw new Error("Recurrence suggestion references transactions outside the company scope");
  }

  const key = deduplicationKey(params.suggestion);
  const existing = await params.client.recurrenceSuggestion.findUnique({
    where: { deduplicationKey: key },
  });

  let persisted: PersistedRecurrenceSuggestion;
  let created = false;

  if (existing) {
    if (existing.companyId !== params.companyId) {
      throw new Error("Recurrence suggestion deduplication key belongs to another company");
    }
    persisted = existing;
  } else {
    const categoryId = await existingCategoryId(
      params.client,
      params.companyId,
      params.suggestion.categoryId,
    );
    persisted = await params.client.recurrenceSuggestion.create({
      data: {
        id: params.suggestion.id,
        companyId: params.companyId,
        categoryId,
        type: params.suggestion.type,
        representativeDescription: params.suggestion.representativeDescription,
        normalizedDescription: params.suggestion.normalizedDescription,
        frequency: params.suggestion.frequency,
        recurrenceType: params.suggestion.recurrenceType,
        patternKind: params.suggestion.patternKind,
        averageAmount: params.suggestion.averageAmount,
        estimatedNextAmount: params.suggestion.estimatedNextAmount,
        amountVariationPercent: params.suggestion.amountVariationPercent,
        expectedNextDate: dateOnly(params.suggestion.expectedNextDate),
        confidenceScore: params.suggestion.confidenceScore,
        evidence: evidenceForSuggestion({
          suggestion: params.suggestion,
          transactions,
        }),
        startDate: dateOnly(params.suggestion.startDate)!,
        endDate: dateOnly(params.suggestion.endDate),
        installmentCount: params.suggestion.installmentCount,
        deduplicationKey: key,
      },
    });
    created = true;

    await params.client.auditEvent.create({
      data: {
        companyId: params.companyId,
        actorUserId: null,
        entityType: "RecurrenceSuggestion",
        entityId: persisted.id,
        action: "recurrence.suggestion_created",
        recurrenceSuggestionId: persisted.id,
        metadata: {
          confidenceScore: persisted.confidenceScore,
          transactionIds: params.suggestion.transactionIds,
          detectorSuggestionId: params.suggestion.id,
        },
      },
    });
  }

  await params.client.recurrenceSuggestionTransaction.createMany({
    data: transactions.map((transaction) => ({
      companyId: params.companyId,
      recurrenceSuggestionId: persisted.id,
      transactionId: transaction.id,
    })),
    skipDuplicates: true,
  });

  const pendingKey = pendingDeduplicationKey(params.companyId, persisted.id);
  const existingPending = await params.client.pendingItem.findFirst({
    where: {
      companyId: params.companyId,
      recurrenceSuggestionId: persisted.id,
      deduplicationKey: pendingKey,
      status: { in: ["open", "in_review"] },
    },
  });
  let pendingCreated = false;

  if (!existingPending) {
    await params.client.pendingItem.create({
      data: {
        companyId: params.companyId,
        type: recurrenceApprovalType,
        severity: persisted.confidenceScore >= 85 ? "high" : "medium",
        recurrenceSuggestionId: persisted.id,
        deduplicationKey: pendingKey,
        title: "Aprovar recorrência sugerida",
        description: "O detector encontrou um padrão recorrente que precisa de aprovação humana.",
        metadata: {
          confidenceScore: persisted.confidenceScore,
          frequency: persisted.frequency,
          recurrenceType: persisted.recurrenceType,
          transactionIds: params.suggestion.transactionIds,
        },
      },
    });
    pendingCreated = true;
  }

  return { suggestion: persisted, created, pendingCreated };
}

export async function detectRecurrenceSuggestionsForCompany(
  input: DetectRecurrencesForCompanyInput,
  client: PrismaClient = prisma,
): Promise<RecurrenceDetectionWorkflowResult> {
  const transactions = await client.transaction.findMany({
    where: {
      companyId: input.companyId,
      ...(input.bankAccountId ? { bankAccountId: input.bankAccountId } : {}),
      ...(input.transactionIds ? { id: { in: input.transactionIds } } : {}),
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  const recurrenceInputs = transactions.map(transactionToRecurrenceInput);
  const detected = detectRecurrences(recurrenceInputs);
  const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  const persisted: PersistedRecurrenceSuggestion[] = [];
  let suggestionsCreated = 0;
  let pendingCreated = 0;

  await client.$transaction(async (tx) => {
    for (const suggestion of detected) {
      if (suggestion.companyId !== input.companyId) {
        throw new Error("Detector returned a suggestion outside the company scope");
      }
      const result = await persistSuggestion({
        client: tx,
        suggestion,
        companyId: input.companyId,
        transactionsById,
      });
      persisted.push(result.suggestion);
      if (result.created) suggestionsCreated += 1;
      if (result.pendingCreated) pendingCreated += 1;
    }
  });

  return {
    processedTransactions: transactions.length,
    detectedSuggestions: detected.length,
    suggestionsCreated,
    pendingCreated,
    suggestions: persisted,
  };
}

export { recurrenceApprovalType };
