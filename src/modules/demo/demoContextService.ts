import { prisma } from "../../lib/prisma";
import {
  demoBankAccountId,
  demoCompanyId,
  recommendedDemoUserId,
} from "../../lib/demo";
import type { PrismaClient, Role } from "@prisma/client";

export interface DemoContext {
  company: {
    id: string;
    name: string;
  } | null;
  bankAccount: {
    id: string;
    bankName: string;
    accountNumberMasked: string;
  } | null;
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: Role;
  }>;
  recommendedUserId: string;
}

export async function getDemoContext(client: PrismaClient = prisma): Promise<DemoContext> {
  const company = await client.company.findUnique({
    where: { id: demoCompanyId },
    select: {
      id: true,
      name: true,
    },
  });

  const bankAccount = await client.bankAccount.findFirst({
    where: {
      id: demoBankAccountId,
      companyId: demoCompanyId,
    },
    select: {
      id: true,
      bankName: true,
      accountNumberMasked: true,
    },
  });

  const memberships = await client.companyMembership.findMany({
    where: { companyId: demoCompanyId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return {
    company,
    bankAccount,
    users: memberships.map((membership) => ({
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
    })),
    recommendedUserId: recommendedDemoUserId,
  };
}
