import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { assertCan, can } from "../src/lib/rbac";

describe("RBAC", () => {
  it("recognizes admin permissions", () => {
    expect(can(Role.admin, "import:create")).toBe(true);
    expect(can(Role.admin, "company:manage")).toBe(true);
    expect(can(Role.admin, "users:manage")).toBe(true);
  });

  it("recognizes accountant permissions", () => {
    expect(can(Role.accountant, "import:create")).toBe(true);
    expect(can(Role.accountant, "pending:review")).toBe(true);
    expect(can(Role.accountant, "recurrences:manage")).toBe(true);
    expect(can(Role.accountant, "users:manage")).toBe(false);
  });

  it("recognizes viewer permissions", () => {
    expect(can(Role.viewer, "dashboard:view")).toBe(true);
    expect(can(Role.viewer, "projection:view")).toBe(true);
    expect(can(Role.viewer, "import:create")).toBe(false);
    expect(() => assertCan(Role.viewer, "pending:review")).toThrow(
      "Role viewer cannot perform pending:review",
    );
  });
});
