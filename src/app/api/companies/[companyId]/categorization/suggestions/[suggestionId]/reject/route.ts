import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import {
  CategorizationReviewError,
  ConcurrencyError,
  DomainInvariantError,
  rejectCategorizationSuggestion,
} from "@/modules/categorization";

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
      "pending:review",
    );
    const body = (await request.json().catch(() => ({}))) as { reason?: string };

    return Response.json(
      await rejectCategorizationSuggestion(
        {
          companyId,
          suggestionId,
          actorUserId: actor.userId,
          reason: body.reason?.trim() || "Rejeição manual via demo UI",
        },
        prisma,
      ),
    );
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    if (
      error instanceof CategorizationReviewError ||
      error instanceof DomainInvariantError ||
      error instanceof ConcurrencyError
    ) {
      const status = error instanceof ConcurrencyError ? 409 : 400;
      return Response.json({ error: "CATEGORIZATION_REJECT_FAILED", message: error.message }, { status });
    }
    return Response.json({ error: "CATEGORIZATION_REJECT_FAILED" }, { status: 500 });
  }
}
