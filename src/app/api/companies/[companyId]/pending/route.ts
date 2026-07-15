import { actorUserIdFromRequest, requireCompanyMembership, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import { listPendingItemsForDemo } from "@/modules/demo/demoReadService";
import type { PendingStatus } from "@prisma/client";

interface RouteParams {
  companyId: string;
}

function parseStatuses(value: string | null): PendingStatus[] | undefined {
  if (!value) return undefined;
  const allowed: PendingStatus[] = ["open", "in_review", "resolved", "dismissed"];
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is PendingStatus => allowed.includes(part as PendingStatus));
  return parts.length > 0 ? parts : undefined;
}

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> },
) {
  try {
    const { companyId } = await context.params;
    await requireCompanyMembership(prisma, companyId, actorUserIdFromRequest(request));
    const url = new URL(request.url);
    const status = parseStatuses(url.searchParams.get("status"));
    const type = url.searchParams.get("type") ?? undefined;

    return Response.json(await listPendingItemsForDemo({ companyId, status, type }, prisma));
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return Response.json({ error: "PENDING_FAILED" }, { status: 500 });
  }
}
