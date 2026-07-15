import type {
  PendingStatus,
  PrismaClient,
  RecurrenceSuggestionStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ensureBaseScenario } from "../projection";

export interface DashboardSummary {
  companyId: string;
  totalTransactions: number;
  openPendingItems: number;
  totalRecurrenceSuggestions: number;
  totalApprovedRecurrences: number;
  projectedItems30: number;
  projectedItems60: number;
  projectedItems90: number;
  currentBalance: number;
}

export async function getDashboardSummary(
  companyId: string,
  client: PrismaClient = prisma,
): Promise<DashboardSummary> {
  const [
    totalTransactions,
    openPendingItems,
    totalRecurrenceSuggestions,
    totalApprovedRecurrences,
    projectedItems30,
    projectedItems60,
    projectedItems90,
    balanceAggregate,
  ] = await Promise.all([
    client.transaction.count({ where: { companyId } }),
    client.pendingItem.count({
      where: {
        companyId,
        status: { in: ["open", "in_review"] },
      },
    }),
    client.recurrenceSuggestion.count({ where: { companyId } }),
    client.approvedRecurrence.count({ where: { companyId } }),
    client.projectedCashflowItem.count({ where: { companyId, horizonDays: 30 } }),
    client.projectedCashflowItem.count({ where: { companyId, horizonDays: 60 } }),
    client.projectedCashflowItem.count({ where: { companyId, horizonDays: 90 } }),
    client.transaction.aggregate({
      where: { companyId },
      _sum: { amount: true },
    }),
  ]);

  return {
    companyId,
    totalTransactions,
    openPendingItems,
    totalRecurrenceSuggestions,
    totalApprovedRecurrences,
    projectedItems30,
    projectedItems60,
    projectedItems90,
    currentBalance: balanceAggregate._sum.amount?.toNumber() ?? 0,
  };
}

export function listRecentTransactions(
  companyId: string,
  client: PrismaClient = prisma,
  limit = 50,
) {
  return client.transaction.findMany({
    where: { companyId },
    include: {
      category: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export function listPendingItemsForDemo(
  params: {
    companyId: string;
    status?: PendingStatus[];
    type?: string;
  },
  client: PrismaClient = prisma,
) {
  return client.pendingItem.findMany({
    where: {
      companyId: params.companyId,
      ...(params.status ? { status: { in: params.status } } : { status: { in: ["open", "in_review"] } }),
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

export function listRecurrenceSuggestionsForDemo(
  params: {
    companyId: string;
    status?: RecurrenceSuggestionStatus[];
  },
  client: PrismaClient = prisma,
) {
  return client.recurrenceSuggestion.findMany({
    where: {
      companyId: params.companyId,
      ...(params.status ? { status: { in: params.status } } : {}),
    },
    include: {
      category: {
        select: { id: true, name: true },
      },
      transactions: {
        select: { id: true, transactionId: true },
      },
      pendingItems: {
        where: { status: { in: ["open", "in_review"] } },
        select: { id: true, status: true },
      },
      approvedRecurrences: {
        select: { id: true, status: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export function listApprovedRecurrencesForDemo(
  companyId: string,
  client: PrismaClient = prisma,
) {
  return client.approvedRecurrence.findMany({
    where: { companyId },
    include: {
      category: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function getProjectionForDemo(
  companyId: string,
  client: PrismaClient = prisma,
) {
  const baseScenario = await ensureBaseScenario(companyId, client);
  const items = await client.projectedCashflowItem.findMany({
    where: {
      companyId,
      baseScenarioId: baseScenario.id,
    },
    include: {
      approvedRecurrence: {
        select: {
          id: true,
          description: true,
          status: true,
        },
      },
    },
    orderBy: [{ horizonDays: "asc" }, { date: "asc" }, { createdAt: "asc" }],
  });

  return {
    baseScenario,
    horizons: {
      30: items.filter((item) => item.horizonDays === 30),
      60: items.filter((item) => item.horizonDays === 60),
      90: items.filter((item) => item.horizonDays === 90),
    },
  };
}

export function getLatestBankImport(
  companyId: string,
  bankAccountId?: string,
  client: PrismaClient = prisma,
) {
  return client.bankImport.findFirst({
    where: {
      companyId,
      ...(bankAccountId ? { bankAccountId } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      uploadedFile: {
        select: {
          id: true,
          originalFileName: true,
          sizeBytes: true,
          createdAt: true,
        },
      },
      bankAccount: {
        select: {
          id: true,
          bankName: true,
          accountNumberMasked: true,
        },
      },
    },
  });
}
