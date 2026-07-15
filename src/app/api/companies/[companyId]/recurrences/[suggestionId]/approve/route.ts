import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import {
  approveRecurrenceSuggestion,
  editRecurrenceSuggestion,
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
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
      description?: string;
      categoryId?: string | null;
      estimatedAmount?: number | string;
      frequency?: "monthly" | "weekly" | "biweekly" | "yearly" | "unknown";
      nextDate?: string | null;
      endDate?: string | null;
      installmentCount?: number | null;
    };

    if (
      body.description !== undefined ||
      body.categoryId !== undefined ||
      body.estimatedAmount !== undefined ||
      body.frequency !== undefined ||
      body.nextDate !== undefined ||
      body.endDate !== undefined ||
      body.installmentCount !== undefined
    ) {
      await editRecurrenceSuggestion(
        {
          companyId,
          suggestionId,
          actorUserId: actor.userId,
          reason: body.reason,
          description: body.description,
          categoryId: body.categoryId,
          estimatedAmount: body.estimatedAmount,
          frequency: body.frequency,
          nextDate: body.nextDate,
          endDate: body.endDate,
          installmentCount: body.installmentCount,
        },
        prisma,
      );
    }

    return Response.json(
      await approveRecurrenceSuggestion(
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
      return Response.json({ error: "RECURRENCE_APPROVAL_FAILED", message: error.message }, { status: 400 });
    }
    return Response.json({ error: "RECURRENCE_APPROVAL_FAILED" }, { status: 500 });
  }
}
