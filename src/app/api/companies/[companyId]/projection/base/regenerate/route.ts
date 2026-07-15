import { actorUserIdFromRequest, requireCompanyPermission, CompanyAccessError } from "@/lib/companyAccess";
import { prisma } from "@/lib/prisma";
import { getProjectionForDemo } from "@/modules/demo/demoReadService";
import { generateProjection, ProjectionError } from "@/modules/projection";

interface RouteParams {
  companyId: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> },
) {
  try {
    const { companyId } = await context.params;
    const actor = await requireCompanyPermission(
      prisma,
      companyId,
      actorUserIdFromRequest(request),
      "recurrences:manage",
    );

    await generateProjection({ companyId, actorUserId: actor.userId, horizonDays: 30 }, prisma);
    await generateProjection({ companyId, actorUserId: actor.userId, horizonDays: 60 }, prisma);
    await generateProjection({ companyId, actorUserId: actor.userId, horizonDays: 90 }, prisma);

    return Response.json(await getProjectionForDemo(companyId, prisma));
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ProjectionError) {
      return Response.json({ error: "PROJECTION_REGENERATE_FAILED", message: error.message }, { status: 400 });
    }
    return Response.json({ error: "PROJECTION_REGENERATE_FAILED" }, { status: 500 });
  }
}
