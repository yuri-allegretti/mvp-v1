import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import {
  rejectRecurrenceSuggestion,
  RecurrenceApprovalError,
  RecurrenceAuthorizationError,
} from "@/modules/recurrences";

interface RouteParams {
  companyId: string;
  suggestionId: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> },
) {
  try {
    const { companyId, suggestionId } = await context.params;
    const actor = await requireCompanyPermission(
      prisma,
      companyId,
      actorUserIdFromRequest(request),
      "recurrences:manage",
    );
    const body = (await request.json().catch(() => ({}))) as { reason?: string };

    return Response.json(
      await rejectRecurrenceSuggestion(
        {
          companyId,
          suggestionId,
          actorUserId: actor.userId,
          reason: body.reason,
        },
        prisma,
      ),
    );
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof RecurrenceAuthorizationError) {
      return Response.json({ error: "FORBIDDEN", message: error.message }, { status: 403 });
    }
    if (error instanceof RecurrenceApprovalError) {
      return Response.json({ error: "RECURRENCE_REJECTION_FAILED", message: error.message }, { status: 400 });
    }
    return Response.json({ error: "RECURRENCE_REJECTION_FAILED" }, { status: 500 });
  }
}
