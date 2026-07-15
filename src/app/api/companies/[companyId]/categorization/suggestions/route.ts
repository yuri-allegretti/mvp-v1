import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import {
  listCategorizationSuggestions,
} from "@/modules/categorization";
import type { CategorizationSuggestionStatus } from "@prisma/client";

interface RouteParams {
  companyId: string;
}

const allowedStatuses: CategorizationSuggestionStatus[] = [
  "generated",
  "applied",
  "accepted",
  "corrected",
  "rejected",
  "superseded",
];

function parseStatuses(value: string | null): CategorizationSuggestionStatus[] | undefined {
  if (!value) return undefined;
  const statuses = value
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is CategorizationSuggestionStatus =>
      allowedStatuses.includes(part as CategorizationSuggestionStatus),
    );
  return statuses.length > 0 ? statuses : undefined;
}

function parsePendingOnly(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  return value === "1" || value === "true";
}

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> },
) {
  try {
    const { companyId } = await context.params;
    await requireCompanyPermission(
      prisma,
      companyId,
      actorUserIdFromRequest(request),
      "transactions:view",
    );

    const url = new URL(request.url);
    return Response.json(
      await listCategorizationSuggestions(
        {
          companyId,
          status: parseStatuses(url.searchParams.get("status")),
          transactionId: url.searchParams.get("transactionId") ?? undefined,
          pendingOnly: parsePendingOnly(url.searchParams.get("pending")),
        },
        prisma,
      ),
    );
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return Response.json({ error: "CATEGORIZATION_SUGGESTIONS_FAILED" }, { status: 500 });
  }
}
