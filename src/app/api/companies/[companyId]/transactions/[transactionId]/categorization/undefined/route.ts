import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import {
  ConcurrencyError,
  DomainInvariantError,
  markTransactionCategorizationUndefined,
} from "@/modules/categorization";

interface RouteParams {
  companyId: string;
  transactionId: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> },
) {
  try {
    const { companyId, transactionId } = await context.params;
    const actor = await requireCompanyPermission(
      prisma,
      companyId,
      actorUserIdFromRequest(request),
      "pending:review",
    );
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
      suggestionId?: string;
    };

    return Response.json(
      await markTransactionCategorizationUndefined(
        {
          companyId,
          transactionId,
          actorUserId: actor.userId,
          suggestionId: body.suggestionId,
          reason: body.reason?.trim() || "Marcado como indefinido via demo UI",
        },
        prisma,
      ),
    );
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof DomainInvariantError || error instanceof ConcurrencyError) {
      const status = error instanceof ConcurrencyError ? 409 : 400;
      return Response.json({ error: "CATEGORIZATION_UNDEFINED_FAILED", message: error.message }, { status });
    }
    return Response.json({ error: "CATEGORIZATION_UNDEFINED_FAILED" }, { status: 500 });
  }
}
