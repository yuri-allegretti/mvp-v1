import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import {
  RecurrenceApprovalError,
  updateApprovedRecurrenceStatus,
} from "@/modules/recurrences";
import type { RecurrenceStatus } from "@prisma/client";

interface RouteParams {
  companyId: string;
  approvedRecurrenceId: string;
}

function isRecurrenceStatus(value: string): value is RecurrenceStatus {
  return value === "active" || value === "paused" || value === "ended" || value === "rejected";
}

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> },
) {
  try {
    const { companyId, approvedRecurrenceId } = await context.params;
    const actor = await requireCompanyPermission(
      prisma,
      companyId,
      actorUserIdFromRequest(request),
      "recurrences:manage",
    );
    const body = (await request.json()) as { status?: string; reason?: string };
    if (!body.status || !isRecurrenceStatus(body.status)) {
      return Response.json(
        { error: "INVALID_STATUS", message: "status must be active, paused, ended or rejected." },
        { status: 400 },
      );
    }

    return Response.json(
      await updateApprovedRecurrenceStatus(
        {
          companyId,
          approvedRecurrenceId,
          actorUserId: actor.userId,
          status: body.status,
          reason: body.reason,
        },
        prisma,
      ),
    );
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof RecurrenceApprovalError) {
      return Response.json({ error: "APPROVED_RECURRENCE_STATUS_FAILED", message: error.message }, { status: 400 });
    }
    return Response.json({ error: "APPROVED_RECURRENCE_STATUS_FAILED" }, { status: 500 });
  }
}
