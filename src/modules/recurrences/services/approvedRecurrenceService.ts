import type {
  ApprovedRecurrence,
  PrismaClient,
  RecurrenceStatus,
} from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import {
  RecurrenceApprovalError,
  requireRecurrenceManagementPermission,
} from "./recurrenceApprovalService";

export interface UpdateApprovedRecurrenceStatusInput {
  companyId: string;
  approvedRecurrenceId: string;
  actorUserId: string;
  status: RecurrenceStatus;
  reason?: string;
}

function statusAction(status: RecurrenceStatus): string {
  switch (status) {
    case "active":
      return "recurrence.activated";
    case "paused":
      return "recurrence.paused";
    case "ended":
      return "recurrence.ended";
    case "rejected":
      return "recurrence.rejected_after_approval";
    default:
      return "recurrence.updated";
  }
}

export async function listApprovedRecurrences(
  companyId: string,
  client: PrismaClient = prisma,
): Promise<ApprovedRecurrence[]> {
  return client.approvedRecurrence.findMany({
    where: { companyId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function updateApprovedRecurrenceStatus(
  input: UpdateApprovedRecurrenceStatusInput,
  client: PrismaClient = prisma,
): Promise<ApprovedRecurrence> {
  await requireRecurrenceManagementPermission(client, input.companyId, input.actorUserId);

  return client.$transaction(async (tx) => {
    const recurrence = await tx.approvedRecurrence.findUnique({
      where: {
        id_companyId: {
          id: input.approvedRecurrenceId,
          companyId: input.companyId,
        },
      },
    });

    if (!recurrence) {
      throw new RecurrenceApprovalError("Approved recurrence not found for company");
    }

    const updated = await tx.approvedRecurrence.update({
      where: {
        id_companyId: {
          id: input.approvedRecurrenceId,
          companyId: input.companyId,
        },
      },
      data: {
        status: input.status,
      },
    });

    if (updated.recurrenceSuggestionId && input.status === "rejected") {
      await tx.recurrenceSuggestion.update({
        where: {
          id_companyId: {
            id: updated.recurrenceSuggestionId,
            companyId: input.companyId,
          },
        },
        data: {
          status: "rejected",
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        entityType: "ApprovedRecurrence",
        entityId: updated.id,
        action: statusAction(input.status),
        approvedRecurrenceId: updated.id,
        recurrenceSuggestionId: updated.recurrenceSuggestionId,
        finalCategoryId: updated.categoryId,
        metadata: {
          previousStatus: recurrence.status,
          nextStatus: updated.status,
        },
        reason: input.reason ?? null,
      },
    });

    return updated;
  });
}
