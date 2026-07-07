import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import { listApprovedRecurrencesForDemo } from "@/modules/demo/demoReadService";

interface RouteParams {
  companyId: string;
}

export async function GET(
  request: Request,
  context: { params: RouteParams | Promise<RouteParams> },
) {
  try {
    const { companyId } = await context.params;
    await requireCompanyPermission(
      prisma,
      companyId,
      actorUserIdFromRequest(request),
      "recurrences:view",
    );

    return Response.json(await listApprovedRecurrencesForDemo(companyId, prisma));
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return Response.json({ error: "APPROVED_RECURRENCES_FAILED" }, { status: 500 });
  }
}
