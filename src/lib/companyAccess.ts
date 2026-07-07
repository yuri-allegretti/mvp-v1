import type { Permission } from "./rbac";
import { can } from "./rbac";
import { recommendedDemoUserId } from "./demo";
import type { PrismaClient, Role } from "@prisma/client";

export class CompanyAccessError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CompanyAccessError";
  }
}

export interface CompanyActor {
  userId: string;
  role: Role;
}

export function actorUserIdFromRequest(request: Request): string | null {
  const headerUserId = request.headers.get("x-user-id");
  if (headerUserId) return headerUserId;

  const url = new URL(request.url);
  return url.searchParams.get("userId");
}

export function actorUserIdFromSearchParam(value: string | string[] | undefined): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (Array.isArray(value) && value[0]?.trim()) return value[0];
  return recommendedDemoUserId;
}

export async function requireCompanyMembership(
  client: PrismaClient,
  companyId: string,
  actorUserId: string | null,
): Promise<CompanyActor> {
  if (!actorUserId) {
    throw new CompanyAccessError(401, "MISSING_USER", "x-user-id header is required");
  }

  const membership = await client.companyMembership.findUnique({
    where: {
      userId_companyId: {
        userId: actorUserId,
        companyId,
      },
    },
    select: { role: true },
  });

  if (!membership) {
    throw new CompanyAccessError(
      403,
      "COMPANY_ACCESS_DENIED",
      "User does not belong to the requested company.",
    );
  }

  return {
    userId: actorUserId,
    role: membership.role,
  };
}

export async function requireCompanyPermission(
  client: PrismaClient,
  companyId: string,
  actorUserId: string | null,
  permission: Permission,
): Promise<CompanyActor> {
  const actor = await requireCompanyMembership(client, companyId, actorUserId);

  if (!can(actor.role, permission)) {
    throw new CompanyAccessError(
      403,
      "FORBIDDEN",
      `Role ${actor.role} cannot perform ${permission}.`,
    );
  }

  return actor;
}
