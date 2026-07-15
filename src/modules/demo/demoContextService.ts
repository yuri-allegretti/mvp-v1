import { prisma } from "../../lib/prisma";
import {
  demoBankAccountId,
  demoCompanies,
  demoCompanyId,
  recommendedDemoUserId,
} from "../../lib/demo";
import type { PrismaClient, Role } from "@prisma/client";

export interface DemoContext {
  company: {
    id: string;
    name: string;
  } | null;
  companies: Array<{
    id: string;
    name: string;
  }>;
  bankAccount: {
    id: string;
    bankName: string;
    accountNumberMasked: string;
  } | null;
  bankAccounts: Array<{
    id: string;
    bankName: string;
    accountNumberMasked: string;
  }>;
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: Role;
  }>;
  recommendedUserId: string;
}

export async function getDemoContext(
  client: PrismaClient = prisma,
  options?: {
    companyId?: string | null;
    bankAccountId?: string | null;
  },
): Promise<DemoContext> {
  const companies = await client.company.findMany({
    where: {
      id: {
        in: demoCompanies.map((company) => company.id),
      },
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const selectedCompany =
    companies.find((company) => company.id === options?.companyId) ??
    companies.find((company) => company.id === demoCompanyId) ??
    companies[0] ??
    null;

  const bankAccounts = selectedCompany
    ? await client.bankAccount.findMany({
        where: {
          companyId: selectedCompany.id,
        },
        select: {
          id: true,
          bankName: true,
          accountNumberMasked: true,
        },
        orderBy: [{ createdAt: "asc" }],
      })
    : [];

  const selectedBankAccount =
    bankAccounts.find((bankAccount) => bankAccount.id === options?.bankAccountId) ??
    bankAccounts.find((bankAccount) => bankAccount.id === demoBankAccountId) ??
    bankAccounts[0] ??
    null;

  const memberships = selectedCompany
    ? await client.companyMembership.findMany({
        where: { companyId: selectedCompany.id },
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
      })
    : [];

  return {
    company: selectedCompany,
    companies,
    bankAccount: selectedBankAccount,
    bankAccounts,
    users: memberships.map((membership) => ({
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
    })),
    recommendedUserId: recommendedDemoUserId,
  };
}
