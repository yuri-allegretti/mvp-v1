import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import {
  CategorizationReviewError,
  ConcurrencyError,
  DomainInvariantError,
  correctCategorizationSuggestion,
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
    const body = (await request.json().catch(() => ({}))) as {
      categoryId?: string;
      reason?: string;
    };

    if (!body.categoryId) {
      return Response.json(
        { error: "CATEGORY_ID_REQUIRED", message: "categoryId is required." },
        { status: 400 },
      );
    }

    return Response.json(
      await correctCategorizationSuggestion(
        {
          companyId,
          suggestionId,
          actorUserId: actor.userId,
          categoryId: body.categoryId,
          reason: body.reason?.trim() || "Correção manual via demo UI",
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
      return Response.json({ error: "CATEGORIZATION_CORRECT_FAILED", message: error.message }, { status });
    }
    return Response.json({ error: "CATEGORIZATION_CORRECT_FAILED" }, { status: 500 });
  }
}
