import {
  ExpectedTransactionType,
  PendingStatus,
  Prisma,
  type PrismaClient,
  type RecurrenceSuggestionStatus,
  type RecurrenceSuggestion,
  type ApprovedRecurrence,
} from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { can } from "../../../lib/rbac";

const actionablePendingStatuses: PendingStatus[] = ["open", "in_review"];
const approvableSuggestionStatuses: RecurrenceSuggestionStatus[] = ["pending", "edited"];

function isApprovableSuggestionStatus(status: RecurrenceSuggestionStatus): boolean {
  return status === "pending" || status === "edited";
}

export class RecurrenceAuthorizationError extends Error {
  constructor(message = "User cannot manage recurrences for this company") {
    super(message);
    this.name = "RecurrenceAuthorizationError";
  }
}

export class RecurrenceApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurrenceApprovalError";
  }
}

export interface EditRecurrenceSuggestionInput {
  companyId: string;
  suggestionId: string;
  actorUserId: string;
  description?: string;
  categoryId?: string | null;
  estimatedAmount?: number | string | Prisma.Decimal;
  frequency?: RecurrenceSuggestion["frequency"];
  nextDate?: Date | string | null;
  endDate?: Date | string | null;
  installmentCount?: number | null;
  reason?: string;
}

export interface ApproveRecurrenceSuggestionInput {
  companyId: string;
  suggestionId: string;
  actorUserId: string;
  reason?: string;
}

export interface RejectRecurrenceSuggestionInput {
  companyId: string;
  suggestionId: string;
  actorUserId: string;
  reason?: string;
}

function normalizeDate(value: Date | string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const iso = value.length === 10 ? `${value}T00:00:00.000Z` : value;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new RecurrenceApprovalError("Invalid date value");
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function normalizeDecimal(
  value: number | string | Prisma.Decimal | undefined,
): Prisma.Decimal | undefined {
  if (value === undefined) return undefined;
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function expectedDayFromDate(value: Date | null): number | null {
  return value ? value.getUTCDate() : null;
}

async function assertCategoryCanBeUsed(params: {
  client: Prisma.TransactionClient;
  companyId: string;
  categoryId: string | null;
  transactionType: RecurrenceSuggestion["type"];
}): Promise<string | null> {
  if (params.categoryId === null) return null;

  const category = await params.client.category.findUnique({
    where: {
      id_companyId: {
        id: params.categoryId,
        companyId: params.companyId,
      },
    },
    select: {
      id: true,
      isActive: true,
      expectedTransactionType: true,
    },
  });

  if (!category) {
    throw new RecurrenceApprovalError("Category not found for company");
  }
  if (!category.isActive) {
    throw new RecurrenceApprovalError("Inactive categories cannot be used for recurrences");
  }
  if (
    category.expectedTransactionType !== ExpectedTransactionType.both &&
    category.expectedTransactionType !== params.transactionType
  ) {
    throw new RecurrenceApprovalError("Category is incompatible with recurrence transaction type");
  }

  return category.id;
}

async function resolveRecurrencePendingItems(params: {
  client: Prisma.TransactionClient;
  companyId: string;
  suggestionId: string;
  actorUserId: string;
  finalStatus: "resolved" | "dismissed";
  reason?: string;
}): Promise<string[]> {
  const pendingItems = await params.client.pendingItem.findMany({
    where: {
      companyId: params.companyId,
      recurrenceSuggestionId: params.suggestionId,
      status: { in: actionablePendingStatuses },
    },
    select: {
      id: true,
      status: true,
      type: true,
      transactionId: true,
      suggestionId: true,
      duplicateCandidateId: true,
      recurrenceSuggestionId: true,
    },
  });

  if (pendingItems.length === 0) return [];

  const now = new Date();
  await params.client.pendingItem.updateMany({
    where: {
      id: { in: pendingItems.map((pendingItem) => pendingItem.id) },
      companyId: params.companyId,
    },
    data: {
      status: params.finalStatus,
      resolvedAt: now,
      resolvedByUserId: params.actorUserId,
    },
  });

  await params.client.auditEvent.createMany({
    data: pendingItems.map((pendingItem) => ({
      companyId: params.companyId,
      actorUserId: params.actorUserId,
      entityType: "PendingItem",
      entityId: pendingItem.id,
      action:
        params.finalStatus === "resolved" ? "pending.resolved" : "pending.dismissed",
      transactionId: pendingItem.transactionId,
      suggestionId: pendingItem.suggestionId,
      recurrenceSuggestionId: pendingItem.recurrenceSuggestionId,
      metadata: {
        pendingType: pendingItem.type,
        previousStatus: pendingItem.status,
        finalStatus: params.finalStatus,
        duplicateCandidateId: pendingItem.duplicateCandidateId,
      },
      reason: params.reason ?? null,
    })),
  });

  return pendingItems.map((pendingItem) => pendingItem.id);
}

export async function requireRecurrenceManagementPermission(
  client: PrismaClient,
  companyId: string,
  actorUserId: string,
): Promise<void> {
  const membership = await client.companyMembership.findUnique({
    where: {
      userId_companyId: {
        userId: actorUserId,
        companyId,
      },
    },
    select: { role: true },
  });

  if (!membership || !can(membership.role, "recurrences:manage")) {
    throw new RecurrenceAuthorizationError();
  }
}

export async function editRecurrenceSuggestion(
  input: EditRecurrenceSuggestionInput,
  client: PrismaClient = prisma,
): Promise<RecurrenceSuggestion> {
  await requireRecurrenceManagementPermission(client, input.companyId, input.actorUserId);

  return client.$transaction(async (tx) => {
    const suggestion = await tx.recurrenceSuggestion.findUnique({
      where: {
        id_companyId: {
          id: input.suggestionId,
          companyId: input.companyId,
        },
      },
    });

    if (!suggestion) {
      throw new RecurrenceApprovalError("Recurrence suggestion not found for company");
    }
    if (!isApprovableSuggestionStatus(suggestion.status)) {
      throw new RecurrenceApprovalError("Recurrence suggestion can no longer be edited");
    }

    const categoryId =
      input.categoryId === undefined
        ? suggestion.categoryId
        : await assertCategoryCanBeUsed({
            client: tx,
            companyId: input.companyId,
            categoryId: input.categoryId,
            transactionType: suggestion.type,
          });

    const nextDate =
      input.nextDate === undefined ? suggestion.expectedNextDate : normalizeDate(input.nextDate);
    const endDate =
      input.endDate === undefined ? suggestion.endDate : normalizeDate(input.endDate);
    const installmentCount =
      input.installmentCount === undefined
        ? suggestion.installmentCount
        : input.installmentCount;

    const updated = await tx.recurrenceSuggestion.update({
      where: {
        id_companyId: {
          id: input.suggestionId,
          companyId: input.companyId,
        },
      },
      data: {
        representativeDescription: input.description ?? suggestion.representativeDescription,
        categoryId,
        estimatedNextAmount:
          normalizeDecimal(input.estimatedAmount) ?? suggestion.estimatedNextAmount,
        frequency: input.frequency ?? suggestion.frequency,
        expectedNextDate: nextDate,
        endDate,
        installmentCount,
        status: "edited",
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        entityType: "RecurrenceSuggestion",
        entityId: updated.id,
        action: "recurrence.suggestion_edited",
        recurrenceSuggestionId: updated.id,
        finalCategoryId: updated.categoryId,
        metadata: {
          description: updated.representativeDescription,
          estimatedNextAmount: updated.estimatedNextAmount.toString(),
          frequency: updated.frequency,
          expectedNextDate: updated.expectedNextDate?.toISOString().slice(0, 10) ?? null,
          endDate: updated.endDate?.toISOString().slice(0, 10) ?? null,
          installmentCount: updated.installmentCount,
        },
        reason: input.reason ?? null,
      },
    });

    return updated;
  });
}

export async function approveRecurrenceSuggestion(
  input: ApproveRecurrenceSuggestionInput,
  client: PrismaClient = prisma,
): Promise<ApprovedRecurrence> {
  await requireRecurrenceManagementPermission(client, input.companyId, input.actorUserId);

  return client.$transaction(async (tx) => {
    const suggestion = await tx.recurrenceSuggestion.findUnique({
      where: {
        id_companyId: {
          id: input.suggestionId,
          companyId: input.companyId,
        },
      },
    });

    if (!suggestion) {
      throw new RecurrenceApprovalError("Recurrence suggestion not found for company");
    }
    if (!isApprovableSuggestionStatus(suggestion.status)) {
      throw new RecurrenceApprovalError("Recurrence suggestion cannot be approved");
    }

    const existingApproved = await tx.approvedRecurrence.findFirst({
      where: {
        companyId: input.companyId,
        recurrenceSuggestionId: input.suggestionId,
      },
      select: { id: true },
    });
    if (existingApproved) {
      throw new RecurrenceApprovalError("Recurrence suggestion was already approved");
    }

    const categoryId = await assertCategoryCanBeUsed({
      client: tx,
      companyId: input.companyId,
      categoryId: suggestion.categoryId,
      transactionType: suggestion.type,
    });

    const transition = await tx.recurrenceSuggestion.updateMany({
      where: {
        id: suggestion.id,
        companyId: input.companyId,
        status: { in: approvableSuggestionStatuses },
      },
      data: {
        status: "approved",
      },
    });

    if (transition.count !== 1) {
      throw new RecurrenceApprovalError("Recurrence suggestion could not be approved");
    }

    const approvedRecurrence = await tx.approvedRecurrence.create({
      data: {
        companyId: input.companyId,
        recurrenceSuggestionId: suggestion.id,
        categoryId,
        type: suggestion.type,
        description: suggestion.representativeDescription,
        frequency: suggestion.frequency,
        recurrenceType: suggestion.recurrenceType,
        estimatedAmount: suggestion.estimatedNextAmount,
        expectedDay: expectedDayFromDate(suggestion.expectedNextDate),
        nextDate: suggestion.expectedNextDate,
        startDate: suggestion.startDate,
        endDate: suggestion.endDate,
        installmentCount: suggestion.installmentCount,
        status: "active",
        approvedByUserId: input.actorUserId,
      },
    });

    const resolvedPendingIds = await resolveRecurrencePendingItems({
      client: tx,
      companyId: input.companyId,
      suggestionId: suggestion.id,
      actorUserId: input.actorUserId,
      finalStatus: "resolved",
      reason: input.reason,
    });

    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        entityType: "ApprovedRecurrence",
        entityId: approvedRecurrence.id,
        action: "recurrence.approved",
        recurrenceSuggestionId: suggestion.id,
        approvedRecurrenceId: approvedRecurrence.id,
        finalCategoryId: categoryId,
        metadata: {
          frequency: approvedRecurrence.frequency,
          recurrenceType: approvedRecurrence.recurrenceType,
          estimatedAmount: approvedRecurrence.estimatedAmount.toString(),
          nextDate: approvedRecurrence.nextDate?.toISOString().slice(0, 10) ?? null,
          resolvedPendingIds,
        },
        reason: input.reason ?? null,
      },
    });

    return approvedRecurrence;
  });
}

export async function rejectRecurrenceSuggestion(
  input: RejectRecurrenceSuggestionInput,
  client: PrismaClient = prisma,
): Promise<RecurrenceSuggestion> {
  await requireRecurrenceManagementPermission(client, input.companyId, input.actorUserId);

  return client.$transaction(async (tx) => {
    const suggestion = await tx.recurrenceSuggestion.findUnique({
      where: {
        id_companyId: {
          id: input.suggestionId,
          companyId: input.companyId,
        },
      },
    });

    if (!suggestion) {
      throw new RecurrenceApprovalError("Recurrence suggestion not found for company");
    }
    if (!isApprovableSuggestionStatus(suggestion.status)) {
      throw new RecurrenceApprovalError("Recurrence suggestion cannot be rejected");
    }

    const transition = await tx.recurrenceSuggestion.updateMany({
      where: {
        id: suggestion.id,
        companyId: input.companyId,
        status: { in: approvableSuggestionStatuses },
      },
      data: {
        status: "rejected",
      },
    });

    if (transition.count !== 1) {
      throw new RecurrenceApprovalError("Recurrence suggestion could not be rejected");
    }

    const rejected = await tx.recurrenceSuggestion.findUniqueOrThrow({
      where: {
        id_companyId: {
          id: input.suggestionId,
          companyId: input.companyId,
        },
      },
    });

    const dismissedPendingIds = await resolveRecurrencePendingItems({
      client: tx,
      companyId: input.companyId,
      suggestionId: suggestion.id,
      actorUserId: input.actorUserId,
      finalStatus: "dismissed",
      reason: input.reason,
    });

    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        entityType: "RecurrenceSuggestion",
        entityId: rejected.id,
        action: "recurrence.rejected",
        recurrenceSuggestionId: rejected.id,
        finalCategoryId: rejected.categoryId,
        metadata: {
          dismissedPendingIds,
        },
        reason: input.reason ?? null,
      },
    });

    return rejected;
  });
}
