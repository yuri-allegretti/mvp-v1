import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import { listRecentTransactions } from "@/modules/demo/demoReadService";

interface RouteParams {
  companyId: string;
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
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

    return Response.json(await listRecentTransactions(companyId, prisma, limit));
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return Response.json({ error: "TRANSACTIONS_FAILED" }, { status: 500 });
  }
}
