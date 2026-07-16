import type {
  Prisma,
  RecurrenceSuggestion as PersistedRecurrenceSuggestion,
  Transaction,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { detectRecurrences } from "../core/service/recurrenceDetectionService.ts";
import type { RecurrenceSuggestion as CoreRecurrenceSuggestion } from "../core/types.ts";
import {
  buildRecurrenceAdapterEvidence,
  transactionToRecurrenceInput,
} from "../adapters/transactionToRecurrenceInput";
import {
  areLogicalRecurrenceSuggestionsEquivalent,
  buildLogicalRecurrenceSuggestionCollisionKey,
  buildLogicalRecurrenceSuggestionKey,
  compareRecurrenceSuggestionQuality,
  consolidateCoreRecurrenceSuggestions,
} from "./recurrenceSuggestionConsolidation";

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

function pendingDeduplicationKey(companyId: string, suggestionId: string): string {
  return [companyId, recurrenceApprovalType, suggestionId].join(":");
}

type SuggestionWithTransactions = Prisma.RecurrenceSuggestionGetPayload<{
  include: {
    transactions: {
      select: {
        transactionId: true;
        transaction: { select: { bankAccountId: true; date: true } };
      };
    };
    approvedRecurrences: { select: { id: true } };
  };
}>;

const suggestionRelations = {
  transactions: {
    select: {
      transactionId: true,
      transaction: { select: { bankAccountId: true, date: true } },
    },
  },
  approvedRecurrences: { select: { id: true } },
} satisfies Prisma.RecurrenceSuggestionInclude;

function existingAsCoreShape(existing: SuggestionWithTransactions): Pick<
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
> {
  return {
    id: existing.id,
    companyId: existing.companyId,
    type: existing.type,
    frequency: existing.frequency,
    recurrenceType: existing.recurrenceType,
    normalizedDescription: existing.normalizedDescription,
    representativeDescription: existing.representativeDescription,
    averageAmount: Number(existing.averageAmount),
    estimatedNextAmount: Number(existing.estimatedNextAmount),
    amountVariationPercent: Number(existing.amountVariationPercent),
    confidenceScore: existing.confidenceScore,
    ...(existing.patternKind ? { patternKind: existing.patternKind } : {}),
    ...(existing.installmentCount ? { installmentCount: existing.installmentCount } : {}),
    transactionIds: existing.transactions.map((relation) => relation.transactionId),
  };
}

async function supersedeSuggestions(params: {
  client: Prisma.TransactionClient;
  companyId: string;
  suggestionIds: string[];
}): Promise<void> {
  const ids = [...new Set(params.suggestionIds)];
  if (ids.length === 0) return;
  const now = new Date();
  await params.client.pendingItem.updateMany({
    where: {
      companyId: params.companyId,
      type: recurrenceApprovalType,
      recurrenceSuggestionId: { in: ids },
      status: { in: ["open", "in_review"] },
    },
    data: { status: "dismissed", resolvedAt: now },
  });
  await params.client.recurrenceSuggestion.updateMany({
    where: {
      companyId: params.companyId,
      id: { in: ids },
      status: "pending",
      approvedRecurrences: { none: {} },
    },
    data: { status: "superseded" },
  });
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
}): Promise<{
  suggestion: PersistedRecurrenceSuggestion;
  created: boolean;
  pendingCreated: boolean;
  redundantSuggestionIds: string[];
}> {
  const transactions = params.suggestion.transactionIds
    .map((transactionId) => params.transactionsById.get(transactionId))
    .filter((transaction): transaction is Transaction => Boolean(transaction));

  if (transactions.length !== params.suggestion.transactionIds.length) {
    throw new Error("Recurrence suggestion references transactions outside the company scope");
  }

  const baseKey = buildLogicalRecurrenceSuggestionKey(params.suggestion, params.transactionsById);
  const stableExisting = await params.client.recurrenceSuggestion.findUnique({
    where: { deduplicationKey: baseKey },
    include: suggestionRelations,
  });
  const candidates = await params.client.recurrenceSuggestion.findMany({
    where: {
      companyId: params.companyId,
      status: { in: ["pending", "edited", "approved", "superseded"] },
    },
    include: suggestionRelations,
  });
  const equivalents = candidates.filter((existing) =>
    areLogicalRecurrenceSuggestionsEquivalent({
      left: params.suggestion,
      right: existingAsCoreShape(existing),
      transactionsById: params.transactionsById,
    }),
  );

  let persisted: PersistedRecurrenceSuggestion;
  let created = false;
  const approved = equivalents.find(
    (existing) => existing.status === "approved" || existing.approvedRecurrences.length > 0,
  );
  const canonical =
    approved ??
    [...equivalents].sort(
      (left, right) =>
        Number(right.status === "edited") - Number(left.status === "edited") ||
        Number(right.status !== "superseded") - Number(left.status !== "superseded") ||
        compareRecurrenceSuggestionQuality(
          existingAsCoreShape(left) as CoreRecurrenceSuggestion,
          existingAsCoreShape(right) as CoreRecurrenceSuggestion,
          params.transactionsById,
        ),
    )[0];
  const key =
    canonical?.deduplicationKey ??
    (stableExisting
      ? buildLogicalRecurrenceSuggestionCollisionKey(baseKey, params.suggestion.id)
      : baseKey);

  if (canonical) {
    if (canonical.companyId !== params.companyId) {
      throw new Error("Recurrence suggestion logical key belongs to another company");
    }
    const categoryId = await existingCategoryId(
      params.client,
      params.companyId,
      params.suggestion.categoryId,
    );
    const detectorCandidateIsBetter =
      compareRecurrenceSuggestionQuality(
        params.suggestion,
        existingAsCoreShape(canonical) as CoreRecurrenceSuggestion,
        params.transactionsById,
      ) < 0;
    const shouldRefreshDetectorFields =
      (canonical.status === "pending" || canonical.status === "superseded") &&
      detectorCandidateIsBetter &&
      canonical.approvedRecurrences.length === 0;
    persisted = await params.client.recurrenceSuggestion.update({
      where: { id_companyId: { id: canonical.id, companyId: params.companyId } },
      data: {
        ...(canonical.status === "superseded" ? { status: "pending" as const } : {}),
        ...(shouldRefreshDetectorFields
          ? {
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
              evidence: evidenceForSuggestion({ suggestion: params.suggestion, transactions }),
              startDate: dateOnly(params.suggestion.startDate)!,
              endDate: dateOnly(params.suggestion.endDate),
              installmentCount: params.suggestion.installmentCount,
            }
          : {}),
      },
    });
  } else {
    const categoryId = await existingCategoryId(
      params.client,
      params.companyId,
      params.suggestion.categoryId,
    );
    const inserted = await params.client.recurrenceSuggestion.createMany({
      data: [
        {
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
      ],
      skipDuplicates: true,
    });
    persisted = await params.client.recurrenceSuggestion.findUniqueOrThrow({
      where: { deduplicationKey: key },
    });
    created = inserted.count === 1;

    if (created) {
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
        }
      });
    }
  }

  await params.client.recurrenceSuggestionTransaction.createMany({
    data: transactions.map((transaction) => ({
      companyId: params.companyId,
      recurrenceSuggestionId: persisted.id,
      transactionId: transaction.id,
    })),
    skipDuplicates: true,
  });

  const redundantSuggestionIds = equivalents
    .filter((existing) => existing.id !== persisted.id && existing.status === "pending")
    .map((existing) => existing.id);

  if (persisted.status === "approved" || persisted.status === "rejected" || persisted.status === "superseded") {
    await params.client.pendingItem.updateMany({
      where: {
        companyId: params.companyId,
        type: recurrenceApprovalType,
        recurrenceSuggestionId: persisted.id,
        status: { in: ["open", "in_review"] },
      },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
    return { suggestion: persisted, created, pendingCreated: false, redundantSuggestionIds };
  }

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

  return { suggestion: persisted, created, pendingCreated, redundantSuggestionIds };
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
  const rawDetected = detectRecurrences(recurrenceInputs);
  const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const detected = consolidateCoreRecurrenceSuggestions(rawDetected, transactionsById);

  const persisted: PersistedRecurrenceSuggestion[] = [];
  let suggestionsCreated = 0;
  let pendingCreated = 0;

  await client.$transaction(async (tx) => {
    const redundantSuggestionIds = new Set<string>();
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
      for (const suggestionId of result.redundantSuggestionIds) {
        redundantSuggestionIds.add(suggestionId);
      }
    }

    const activeSuggestionIds = [...new Set(persisted.map((suggestion) => suggestion.id))];
    await supersedeSuggestions({
      client: tx,
      companyId: input.companyId,
      suggestionIds: [...redundantSuggestionIds].filter(
        (suggestionId) => !activeSuggestionIds.includes(suggestionId),
      ),
    });

    if (!input.transactionIds && !input.bankAccountId) {
      const stale = await tx.recurrenceSuggestion.findMany({
        where: {
          companyId: input.companyId,
          status: "pending",
          ...(activeSuggestionIds.length > 0 ? { id: { notIn: activeSuggestionIds } } : {}),
          approvedRecurrences: { none: {} },
        },
        select: { id: true },
      });
      await supersedeSuggestions({
        client: tx,
        companyId: input.companyId,
        suggestionIds: stale.map((suggestion) => suggestion.id),
      });
    }
  });

  return {
    processedTransactions: transactions.length,
    detectedSuggestions: rawDetected.length,
    suggestionsCreated,
    pendingCreated,
    suggestions: persisted,
  };
}

export { recurrenceApprovalType };
