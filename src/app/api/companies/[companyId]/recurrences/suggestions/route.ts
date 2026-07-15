import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import { listRecurrenceSuggestionsForDemo } from "@/modules/demo/demoReadService";
import type { RecurrenceSuggestionStatus } from "@prisma/client";

interface RouteParams {
  companyId: string;
}

function parseStatuses(value: string | null): RecurrenceSuggestionStatus[] | undefined {
  if (!value) return undefined;
  const allowed: RecurrenceSuggestionStatus[] = ["pending", "approved", "rejected", "edited"];
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is RecurrenceSuggestionStatus =>
      allowed.includes(part as RecurrenceSuggestionStatus),
    );
  return parts.length > 0 ? parts : undefined;
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
      "recurrences:view",
    );
    const url = new URL(request.url);
    const status = parseStatuses(url.searchParams.get("status"));
    return Response.json(await listRecurrenceSuggestionsForDemo({ companyId, status }, prisma));
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return Response.json({ error: "RECURRENCE_SUGGESTIONS_FAILED" }, { status: 500 });
  }
}
