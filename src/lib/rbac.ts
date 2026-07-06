import type { Role } from "@prisma/client";

export type Permission =
  | "dashboard:view"
  | "transactions:view"
  | "recurrences:view"
  | "projection:view"
  | "import:create"
  | "pending:review"
  | "categories:manage"
  | "rules:manage"
  | "duplicates:review"
  | "recurrences:manage"
  | "bankAccounts:manage"
  | "company:manage"
  | "users:manage";

const viewerPermissions = [
  "dashboard:view",
  "transactions:view",
  "recurrences:view",
  "projection:view",
] as const satisfies readonly Permission[];

const accountantPermissions = [
  ...viewerPermissions,
  "import:create",
  "pending:review",
  "categories:manage",
  "rules:manage",
  "duplicates:review",
  "recurrences:manage",
] as const satisfies readonly Permission[];

const adminPermissions = [
  ...accountantPermissions,
  "bankAccounts:manage",
  "company:manage",
  "users:manage",
] as const satisfies readonly Permission[];

const permissionsByRole: Record<Role, ReadonlySet<Permission>> = {
  viewer: new Set(viewerPermissions),
  accountant: new Set(accountantPermissions),
  admin: new Set(adminPermissions),
};

export function can(role: Role, permission: Permission): boolean {
  return permissionsByRole[role].has(permission);
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`Role ${role} cannot perform ${permission}`);
  }
}
