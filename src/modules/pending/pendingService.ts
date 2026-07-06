import type { PendingItem, PendingStatus, PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { can } from "../../lib/rbac";

const actionableStatuses: PendingStatus[] = ["open", "in_review"];

export class PendingAuthorizationError extends Error {
  constructor(message = "User cannot decide pending items for this company") {
    super(message);
    this.name = "PendingAuthorizationError";
  }
}

export class PendingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PendingStateError";
  }
}

export interface ListPendingItemsInput {
  companyId: string;
  status?: PendingStatus[];
  type?: string;
}

export interface DecidePendingItemInput {
  companyId: string;
  pendingItemId: string;
  actorUserId: string;
  finalStatus: Extract<PendingStatus, "resolved" | "dismissed">;
  reason?: string;
}

export async function requirePendingDecisionPermission(
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

  if (!membership || !can(membership.role, "pending:review")) {
    throw new PendingAuthorizationError();
  }
}

export function listPendingItems(
  input: ListPendingItemsInput,
  client: PrismaClient = prisma,
): Promise<PendingItem[]> {
  return client.pendingItem.findMany({
    where: {
      companyId: input.companyId,
      status: { in: input.status ?? actionableStatuses },
      ...(input.type ? { type: input.type } : {}),
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function decidePendingItem(
  input: DecidePendingItemInput,
  client: PrismaClient = prisma,
): Promise<PendingItem> {
  await requirePendingDecisionPermission(client, input.companyId, input.actorUserId);

  return client.$transaction(async (tx) => {
    const pending = await tx.pendingItem.findUnique({
      where: {
        id_companyId: {
          id: input.pendingItemId,
          companyId: input.companyId,
        },
      },
    });

    if (!pending) throw new PendingStateError("Pending item not found for company");
    if (!actionableStatuses.includes(pending.status)) {
      throw new PendingStateError("Pending item is not actionable");
    }

    const updated = await tx.pendingItem.update({
      where: {
        id_companyId: {
          id: input.pendingItemId,
          companyId: input.companyId,
        },
      },
      data: {
        status: input.finalStatus,
        resolvedAt: new Date(),
        resolvedByUserId: input.actorUserId,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        entityType: "PendingItem",
        entityId: pending.id,
        action:
          input.finalStatus === "resolved"
            ? "pending.resolved"
            : "pending.dismissed",
        transactionId: pending.transactionId,
        suggestionId: pending.suggestionId,
        recurrenceSuggestionId: pending.recurrenceSuggestionId,
        metadata: {
          pendingType: pending.type,
          previousStatus: pending.status,
          finalStatus: input.finalStatus,
          duplicateCandidateId: pending.duplicateCandidateId,
        },
        reason: input.reason ?? null,
      },
    });

    return updated;
  });
}
