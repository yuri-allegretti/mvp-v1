import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import { listActiveCategoriesForCompany } from "@/modules/categorization";

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

    return Response.json(await listActiveCategoriesForCompany(companyId, prisma));
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return Response.json({ error: "CATEGORIES_FAILED" }, { status: 500 });
  }
}
