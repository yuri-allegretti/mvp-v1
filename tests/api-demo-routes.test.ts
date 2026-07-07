import {
  ImportSource,
  Prisma,
  PrismaClient,
  Role,
  TransactionType,
} from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { approveRecurrenceSuggestion, detectRecurrenceSuggestionsForCompany, editRecurrenceSuggestion } from "../src/modules/recurrences";
import {
  GET as getDemoContextRoute,
} from "../src/app/api/demo/context/route";
import {
  GET as getDashboardSummaryRoute,
} from "../src/app/api/companies/[companyId]/dashboard/summary/route";
import {
  GET as getTransactionsRoute,
} from "../src/app/api/companies/[companyId]/transactions/route";
import {
  GET as getPendingRoute,
} from "../src/app/api/companies/[companyId]/pending/route";
import {
  GET as getRecurrenceSuggestionsRoute,
} from "../src/app/api/companies/[companyId]/recurrences/suggestions/route";
import {
  POST as approveRecurrenceRoute,
} from "../src/app/api/companies/[companyId]/recurrences/[suggestionId]/approve/route";
import {
  GET as getProjectionRoute,
} from "../src/app/api/companies/[companyId]/projection/base/route";
import {
  POST as regenerateProjectionRoute,
} from "../src/app/api/companies/[companyId]/projection/base/regenerate/route";

function databaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for API tests");
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for API tests");

  return line.replace("DATABASE_URL=", "").replace(/^"|"$/g, "");
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl(),
    },
  },
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface TestGraph {
  companyId: string;
  userId: string;
  bankAccountId: string;
}

function makeRequest(url: string, userId?: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      ...(userId ? { "x-user-id": userId } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function cleanup(companyIds: string[], userIds: string[]) {
  await prisma.projectedCashflowItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.auditEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.pendingItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.approvedRecurrence.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.recurrenceSuggestionTransaction.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.recurrenceSuggestion.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.categorizationSuggestion.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.categorizationRule.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.transaction.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.category.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.baseScenario.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.bankAccount.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.companyMembership.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

async function createGraph(role: Role = Role.accountant): Promise<TestGraph> {
  const suffix = crypto.randomUUID();
  const companyId = `api-company-${suffix}`;
  const userId = `api-user-${suffix}`;
  const bankAccountId = `api-account-${suffix}`;

  await prisma.company.create({
    data: { id: companyId, name: `API Company ${suffix}` },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@zelo.local`,
      passwordHash: "hash",
    },
  });
  await prisma.companyMembership.create({
    data: {
      companyId,
      userId,
      role,
    },
  });
  await prisma.bankAccount.create({
    data: {
      id: bankAccountId,
      companyId,
      bankName: "Itau",
      accountNumberMasked: "****1111",
    },
  });

  return { companyId, userId, bankAccountId };
}

async function createTransaction(
  graph: TestGraph,
  overrides: {
    id?: string;
    date?: string;
    amount?: string;
    description?: string;
    counterpartyName?: string | null;
    externalId?: string;
  } = {},
) {
  return prisma.transaction.create({
    data: {
      id: overrides.id ?? `api-tx-${crypto.randomUUID()}`,
      companyId: graph.companyId,
      bankAccountId: graph.bankAccountId,
      date: new Date(`${overrides.date ?? "2026-01-05"}T00:00:00.000Z`),
      amount: new Prisma.Decimal(overrides.amount ?? "-39.90"),
      type: TransactionType.expense,
      description: overrides.description ?? "NETFLIX.COM",
      source: ImportSource.itau_xlsx,
      sourceFileId: `api-source-${crypto.randomUUID()}`,
      externalId: overrides.externalId ?? `api-external-${crypto.randomUUID()}`,
      counterpartyName: overrides.counterpartyName ?? "NETFLIX",
      documentNumber: null,
    },
  });
}

async function createMonthlySeries(graph: TestGraph) {
  await createTransaction(graph, {
    id: `${graph.companyId}-n1`,
    date: "2026-01-05",
    externalId: `${graph.companyId}-ext-1`,
    description: "NETFLIX.COM",
  });
  await createTransaction(graph, {
    id: `${graph.companyId}-n2`,
    date: "2026-02-05",
    externalId: `${graph.companyId}-ext-2`,
    description: "PAGAMENTO NETFLIX",
  });
  await createTransaction(graph, {
    id: `${graph.companyId}-n3`,
    date: "2026-03-05",
    externalId: `${graph.companyId}-ext-3`,
    description: "NETFLIX SERVICOS DIGITAIS",
  });
  await createTransaction(graph, {
    id: `${graph.companyId}-n4`,
    date: "2026-04-05",
    externalId: `${graph.companyId}-ext-4`,
    description: "COMPRA NETFLIX.COM",
  });
}

function tomorrowDate() {
  const value = new Date();
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + 1));
}

async function prepareSuggestion(graph: TestGraph) {
  await createMonthlySeries(graph);
  const result = await detectRecurrenceSuggestionsForCompany({ companyId: graph.companyId }, prisma);
  const suggestion = result.suggestions[0];
  if (!suggestion) throw new Error("Expected recurrence suggestion");
  return suggestion;
}

async function prepareApprovedRecurrence(graph: TestGraph) {
  const suggestion = await prepareSuggestion(graph);
  await editRecurrenceSuggestion(
    {
      companyId: graph.companyId,
      suggestionId: suggestion.id,
      actorUserId: graph.userId,
      nextDate: tomorrowDate(),
      endDate: null,
      installmentCount: null,
    },
    prisma,
  );
  await approveRecurrenceSuggestion(
    {
      companyId: graph.companyId,
      suggestionId: suggestion.id,
      actorUserId: graph.userId,
    },
    prisma,
  );
}

describe("demo and company API routes", () => {
  it("returns demo context", async () => {
    const response = await getDemoContextRoute();
    const payload = await json<{
      company: { id: string; name: string } | null;
      users: Array<{ id: string }>;
      bankAccount: { id: string } | null;
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.company?.id).toBe("demo-company");
    expect(payload.users.length).toBeGreaterThanOrEqual(3);
    expect(payload.bankAccount?.id).toBe("demo-itau-account");
  });

  it("returns dashboard summary for the demo company", async () => {
    const response = await getDashboardSummaryRoute(
      makeRequest("http://localhost/api/companies/demo-company/dashboard/summary", "demo-accountant"),
      { params: { companyId: "demo-company" } },
    );
    const payload = await json<Record<string, unknown>>(response);

    expect(response.status).toBe(200);
    expect(payload.companyId).toBe("demo-company");
    expect(typeof payload.totalTransactions).toBe("number");
    expect(typeof payload.currentBalance).toBe("number");
  });

  it("filters transactions by companyId", async () => {
    const first = await createGraph();
    const second = await createGraph();
    try {
      const firstTransaction = await createTransaction(first, { description: "FIRST ONLY" });
      await createTransaction(second, { description: "SECOND ONLY" });

      const response = await getTransactionsRoute(
        makeRequest(`http://localhost/api/companies/${first.companyId}/transactions`, first.userId),
        { params: { companyId: first.companyId } },
      );
      const payload = await json<Array<{ id: string; companyId: string }>>(response);

      expect(response.status).toBe(200);
      expect(payload.map((item) => item.id)).toContain(firstTransaction.id);
      expect(payload.every((item) => item.companyId === first.companyId)).toBe(true);
    } finally {
      await cleanup([first.companyId, second.companyId], [first.userId, second.userId]);
    }
  });

  it("filters pending items by companyId", async () => {
    const first = await createGraph();
    const second = await createGraph();
    try {
      await prisma.pendingItem.create({
        data: {
          companyId: first.companyId,
          type: "uncategorized_transaction",
          severity: "medium",
          deduplicationKey: `pending-${crypto.randomUUID()}`,
          title: "First",
          description: "First pending",
          metadata: {},
        },
      });
      await prisma.pendingItem.create({
        data: {
          companyId: second.companyId,
          type: "possible_duplicate",
          severity: "medium",
          deduplicationKey: `pending-${crypto.randomUUID()}`,
          title: "Second",
          description: "Second pending",
          metadata: {},
        },
      });

      const response = await getPendingRoute(
        makeRequest(`http://localhost/api/companies/${first.companyId}/pending`, first.userId),
        { params: { companyId: first.companyId } },
      );
      const payload = await json<Array<{ companyId: string }>>(response);

      expect(response.status).toBe(200);
      expect(payload.length).toBe(1);
      expect(payload[0]?.companyId).toBe(first.companyId);
    } finally {
      await cleanup([first.companyId, second.companyId], [first.userId, second.userId]);
    }
  });

  it("filters recurrence suggestions by companyId", async () => {
    const first = await createGraph();
    const second = await createGraph();
    try {
      await prepareSuggestion(first);
      await prepareSuggestion(second);

      const response = await getRecurrenceSuggestionsRoute(
        makeRequest(`http://localhost/api/companies/${first.companyId}/recurrences/suggestions`, first.userId),
        { params: { companyId: first.companyId } },
      );
      const payload = await json<Array<{ companyId: string }>>(response);

      expect(response.status).toBe(200);
      expect(payload.length).toBeGreaterThanOrEqual(1);
      expect(payload.every((item) => item.companyId === first.companyId)).toBe(true);
    } finally {
      await cleanup([first.companyId, second.companyId], [first.userId, second.userId]);
    }
  });

  it("blocks viewer recurrence approval via API", async () => {
    const graph = await createGraph(Role.viewer);
    try {
      const suggestion = await prepareSuggestion(graph);
      const response = await approveRecurrenceRoute(
        makeRequest(
          `http://localhost/api/companies/${graph.companyId}/recurrences/${suggestion.id}/approve`,
          graph.userId,
          "POST",
          {},
        ),
        { params: { companyId: graph.companyId, suggestionId: suggestion.id } },
      );

      expect(response.status).toBe(403);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("allows accountant recurrence approval via API", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const suggestion = await prepareSuggestion(graph);
      const response = await approveRecurrenceRoute(
        makeRequest(
          `http://localhost/api/companies/${graph.companyId}/recurrences/${suggestion.id}/approve`,
          graph.userId,
          "POST",
          {},
        ),
        { params: { companyId: graph.companyId, suggestionId: suggestion.id } },
      );
      const payload = await json<{ recurrenceSuggestionId: string }>(response);

      expect(response.status).toBe(200);
      expect(payload.recurrenceSuggestionId).toBe(suggestion.id);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("blocks viewer projection regeneration via API", async () => {
    const graph = await createGraph(Role.viewer);
    try {
      const response = await regenerateProjectionRoute(
        makeRequest(
          `http://localhost/api/companies/${graph.companyId}/projection/base/regenerate`,
          graph.userId,
          "POST",
          {},
        ),
        { params: { companyId: graph.companyId } },
      );

      expect(response.status).toBe(403);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("allows accountant projection regeneration and returns 30/60/90 items", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      await prepareApprovedRecurrence(graph);

      const regenerateResponse = await regenerateProjectionRoute(
        makeRequest(
          `http://localhost/api/companies/${graph.companyId}/projection/base/regenerate`,
          graph.userId,
          "POST",
          {},
        ),
        { params: { companyId: graph.companyId } },
      );
      expect(regenerateResponse.status).toBe(200);

      const getResponse = await getProjectionRoute(
        makeRequest(`http://localhost/api/companies/${graph.companyId}/projection/base`, graph.userId),
        { params: { companyId: graph.companyId } },
      );
      const payload = await json<{
        horizons: {
          30: Array<unknown>;
          60: Array<unknown>;
          90: Array<unknown>;
        };
      }>(getResponse);

      expect(getResponse.status).toBe(200);
      expect(payload.horizons[30].length).toBeGreaterThanOrEqual(1);
      expect(payload.horizons[60].length).toBeGreaterThanOrEqual(1);
      expect(payload.horizons[90].length).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("blocks cross-company access on new APIs", async () => {
    const first = await createGraph(Role.accountant);
    const second = await createGraph(Role.accountant);
    try {
      await createTransaction(second, { description: "OTHER COMPANY" });

      const response = await getTransactionsRoute(
        makeRequest(`http://localhost/api/companies/${second.companyId}/transactions`, first.userId),
        { params: { companyId: second.companyId } },
      );

      expect(response.status).toBe(403);
    } finally {
      await cleanup([first.companyId, second.companyId], [first.userId, second.userId]);
    }
  });
});
