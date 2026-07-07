import {
  ExpectedTransactionType,
  ImportSource,
  Prisma,
  PrismaClient,
  Role,
  TransactionType,
} from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { categorizeTransactions } from "../src/modules/categorization";
import {
  approveRecurrenceSuggestion,
  detectRecurrenceSuggestionsForCompany,
  editRecurrenceSuggestion,
  rejectRecurrenceSuggestion,
  RecurrenceApprovalError,
  RecurrenceAuthorizationError,
  updateApprovedRecurrenceStatus,
} from "../src/modules/recurrences";
import { ensureBaseScenario, generateProjection } from "../src/modules/projection";

function databaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for recurrence approval tests");
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for recurrence approval tests");
  }

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

function isoOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function cleanup(companyIds: string[], userIds: string[]) {
  await prisma.projectedCashflowItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.auditEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.pendingItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.approvedRecurrence.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.recurrenceSuggestionTransaction.deleteMany({
    where: { companyId: { in: companyIds } },
  });
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
  const companyId = `projection-company-${suffix}`;
  const userId = `projection-user-${suffix}`;
  const bankAccountId = `projection-account-${suffix}`;

  await prisma.company.create({
    data: { id: companyId, name: `Projection Company ${suffix}` },
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
      accountNumberMasked: "****6789",
    },
  });

  return { companyId, userId, bankAccountId };
}

async function createCategory(graph: TestGraph, name = "Software") {
  return prisma.category.create({
    data: {
      id: `projection-category-${crypto.randomUUID()}`,
      companyId: graph.companyId,
      name,
      expectedTransactionType: ExpectedTransactionType.expense,
    },
  });
}

async function createTransaction(
  graph: TestGraph,
  overrides: {
    id?: string;
    date?: string;
    amount?: string;
    type?: TransactionType;
    description?: string;
    counterpartyName?: string | null;
    externalId?: string;
    categoryId?: string | null;
  } = {},
) {
  return prisma.transaction.create({
    data: {
      id: overrides.id ?? `projection-tx-${crypto.randomUUID()}`,
      companyId: graph.companyId,
      bankAccountId: graph.bankAccountId,
      date: new Date(`${overrides.date ?? "2026-01-05"}T00:00:00.000Z`),
      amount: new Prisma.Decimal(overrides.amount ?? "-39.90"),
      type: overrides.type ?? TransactionType.expense,
      description: overrides.description ?? "NETFLIX.COM",
      source: ImportSource.itau_xlsx,
      sourceFileId: `projection-source-${crypto.randomUUID()}`,
      externalId: overrides.externalId ?? `projection-external-${crypto.randomUUID()}`,
      counterpartyName: overrides.counterpartyName ?? "NETFLIX",
      documentNumber: null,
      categoryId: overrides.categoryId ?? null,
    },
  });
}

async function createMonthlySeries(graph: TestGraph, categoryId?: string | null) {
  return Promise.all([
    createTransaction(graph, {
      id: `${graph.companyId}-monthly-1`,
      date: "2026-01-05",
      externalId: `${graph.companyId}-monthly-ext-1`,
      description: "NETFLIX.COM",
      categoryId,
    }),
    createTransaction(graph, {
      id: `${graph.companyId}-monthly-2`,
      date: "2026-02-05",
      externalId: `${graph.companyId}-monthly-ext-2`,
      description: "PAGAMENTO NETFLIX",
      categoryId,
    }),
    createTransaction(graph, {
      id: `${graph.companyId}-monthly-3`,
      date: "2026-03-05",
      externalId: `${graph.companyId}-monthly-ext-3`,
      description: "NETFLIX SERVICOS DIGITAIS",
      categoryId,
    }),
    createTransaction(graph, {
      id: `${graph.companyId}-monthly-4`,
      date: "2026-04-05",
      externalId: `${graph.companyId}-monthly-ext-4`,
      description: "COMPRA NETFLIX.COM",
      categoryId,
    }),
  ]);
}

async function prepareSuggestion(
  graph: TestGraph,
  options: {
    categoryId?: string | null;
  } = {},
) {
  await createMonthlySeries(graph, options.categoryId);
  const result = await detectRecurrenceSuggestionsForCompany({ companyId: graph.companyId }, prisma);
  const suggestion = result.suggestions[0];
  if (!suggestion) throw new Error("Expected recurrence suggestion");
  return suggestion;
}

async function prepareApprovedRecurrence(
  graph: TestGraph,
  options: {
    categoryId?: string | null;
    nextDate?: string;
    endDate?: string | null;
    installmentCount?: number | null;
  } = {},
) {
  const suggestion = await prepareSuggestion(graph, { categoryId: options.categoryId });
  await editRecurrenceSuggestion(
    {
      companyId: graph.companyId,
      suggestionId: suggestion.id,
      actorUserId: graph.userId,
      nextDate: options.nextDate ?? isoOffset(1),
      endDate: options.endDate ?? undefined,
      installmentCount: options.installmentCount ?? undefined,
    },
    prisma,
  );

  return approveRecurrenceSuggestion(
    {
      companyId: graph.companyId,
      suggestionId: suggestion.id,
      actorUserId: graph.userId,
    },
    prisma,
  );
}

describe("recurrence approval and projection workflow", () => {
  it("accountant approves a recurrence suggestion and creates ApprovedRecurrence", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const suggestion = await prepareSuggestion(graph);
      const approved = await approveRecurrenceSuggestion(
        {
          companyId: graph.companyId,
          suggestionId: suggestion.id,
          actorUserId: graph.userId,
        },
        prisma,
      );

      expect(approved.companyId).toBe(graph.companyId);
      expect(approved.recurrenceSuggestionId).toBe(suggestion.id);
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: {
            companyId: graph.companyId,
            recurrenceSuggestionId: suggestion.id,
          },
        }),
      ).resolves.toMatchObject({ status: "resolved" });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("admin approves a recurrence suggestion and creates ApprovedRecurrence", async () => {
    const graph = await createGraph(Role.admin);
    try {
      const suggestion = await prepareSuggestion(graph);
      await expect(
        approveRecurrenceSuggestion(
          {
            companyId: graph.companyId,
            suggestionId: suggestion.id,
            actorUserId: graph.userId,
          },
          prisma,
        ),
      ).resolves.toMatchObject({
        companyId: graph.companyId,
        recurrenceSuggestionId: suggestion.id,
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("viewer cannot approve recurrence suggestions", async () => {
    const graph = await createGraph(Role.viewer);
    try {
      const suggestion = await prepareSuggestion(graph);
      await expect(
        approveRecurrenceSuggestion(
          {
            companyId: graph.companyId,
            suggestionId: suggestion.id,
            actorUserId: graph.userId,
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(RecurrenceAuthorizationError);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("rejection dismisses recurrence approval pending and writes audit", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const suggestion = await prepareSuggestion(graph);
      await rejectRecurrenceSuggestion(
        {
          companyId: graph.companyId,
          suggestionId: suggestion.id,
          actorUserId: graph.userId,
        },
        prisma,
      );

      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, recurrenceSuggestionId: suggestion.id },
        }),
      ).resolves.toMatchObject({ status: "dismissed" });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: { companyId: graph.companyId, action: "recurrence.rejected" },
        }),
      ).resolves.toBeTruthy();
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("approval writes audit and cannot be executed twice", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const suggestion = await prepareSuggestion(graph);
      await approveRecurrenceSuggestion(
        {
          companyId: graph.companyId,
          suggestionId: suggestion.id,
          actorUserId: graph.userId,
        },
        prisma,
      );

      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: { companyId: graph.companyId, action: "recurrence.approved" },
        }),
      ).resolves.toBeTruthy();

      await expect(
        approveRecurrenceSuggestion(
          {
            companyId: graph.companyId,
            suggestionId: suggestion.id,
            actorUserId: graph.userId,
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(RecurrenceApprovalError);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("editing before approval updates expected recurrence fields", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const category = await createCategory(graph, "Subscriptions");
      const suggestion = await prepareSuggestion(graph);
      const edited = await editRecurrenceSuggestion(
        {
          companyId: graph.companyId,
          suggestionId: suggestion.id,
          actorUserId: graph.userId,
          description: "Netflix subscription",
          categoryId: category.id,
          estimatedAmount: "-49.90",
          frequency: "monthly",
          nextDate: isoOffset(3),
          endDate: isoOffset(63),
          installmentCount: 6,
        },
        prisma,
      );

      expect(edited.status).toBe("edited");
      expect(edited.representativeDescription).toBe("Netflix subscription");
      expect(edited.categoryId).toBe(category.id);
      expect(edited.estimatedNextAmount.toString()).toBe("-49.9");
      expect(edited.installmentCount).toBe(6);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("blocks approval for nonexistent or foreign-company suggestions", async () => {
    const first = await createGraph(Role.accountant);
    const second = await createGraph(Role.accountant);
    try {
      const foreignSuggestion = await prepareSuggestion(second);

      await expect(
        approveRecurrenceSuggestion(
          {
            companyId: first.companyId,
            suggestionId: "missing-suggestion",
            actorUserId: first.userId,
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(RecurrenceApprovalError);

      await expect(
        approveRecurrenceSuggestion(
          {
            companyId: first.companyId,
            suggestionId: foreignSuggestion.id,
            actorUserId: first.userId,
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(RecurrenceApprovalError);
    } finally {
      await cleanup(
        [first.companyId, second.companyId],
        [first.userId, second.userId],
      );
    }
  });

  it("creates the Base scenario automatically and keeps it unique per company", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const first = await ensureBaseScenario(graph.companyId, prisma);
      const second = await ensureBaseScenario(graph.companyId, prisma);

      expect(first.id).toBe(second.id);
      await expect(
        prisma.baseScenario.count({ where: { companyId: graph.companyId } }),
      ).resolves.toBe(1);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("generates 30/60/90 projections only from active approved recurrences", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const approved = await prepareApprovedRecurrence(graph);
      const baseScenario = await ensureBaseScenario(graph.companyId, prisma);

      const projection30 = await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 30 },
        prisma,
      );
      const projection60 = await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 60 },
        prisma,
      );
      const projection90 = await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 90 },
        prisma,
      );

      expect(projection30.length).toBeGreaterThan(0);
      expect(projection60.length).toBeGreaterThan(0);
      expect(projection90.length).toBeGreaterThan(0);
      expect(
        projection90.every(
          (item) =>
            item.companyId === graph.companyId &&
            item.baseScenarioId === baseScenario.id &&
            item.approvedRecurrenceId === approved.id,
        ),
      ).toBe(true);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("regenerates projection idempotently and ignores unapproved suggestions", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      await prepareSuggestion(graph);

      const firstRun = await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 30 },
        prisma,
      );
      const secondRun = await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 30 },
        prisma,
      );

      expect(firstRun).toHaveLength(0);
      expect(secondRun).toHaveLength(0);
      await expect(
        prisma.projectedCashflowItem.count({
          where: { companyId: graph.companyId, horizonDays: 30 },
        }),
      ).resolves.toBe(0);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("does not project from categorized transactions without approved recurrences", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const category = await createCategory(graph);
      const transaction = await createTransaction(graph, {
        description: "SOFTWARE ACME",
      });
      await prisma.categorizationRule.create({
        data: {
          companyId: graph.companyId,
          categoryId: category.id,
          ruleType: "description_contains",
          conditions: { value: "SOFTWARE" },
          priority: 900,
          confidence: 95,
          source: "manual",
        },
      });

      await categorizeTransactions(
        { companyId: graph.companyId, transactionIds: [transaction.id] },
        prisma,
      );
      const projection = await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 30 },
        prisma,
      );

      expect(projection).toHaveLength(0);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("paused and ended approved recurrences are removed from regenerated projection", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const approved = await prepareApprovedRecurrence(graph);
      await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 90 },
        prisma,
      );
      await expect(
        prisma.projectedCashflowItem.count({ where: { companyId: graph.companyId, horizonDays: 90 } }),
      ).resolves.toBeGreaterThan(0);

      await updateApprovedRecurrenceStatus(
        {
          companyId: graph.companyId,
          approvedRecurrenceId: approved.id,
          actorUserId: graph.userId,
          status: "paused",
        },
        prisma,
      );
      await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 90 },
        prisma,
      );
      await expect(
        prisma.projectedCashflowItem.count({ where: { companyId: graph.companyId, horizonDays: 90 } }),
      ).resolves.toBe(0);

      await updateApprovedRecurrenceStatus(
        {
          companyId: graph.companyId,
          approvedRecurrenceId: approved.id,
          actorUserId: graph.userId,
          status: "ended",
        },
        prisma,
      );
      await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 90 },
        prisma,
      );
      await expect(
        prisma.projectedCashflowItem.count({ where: { companyId: graph.companyId, horizonDays: 90 } }),
      ).resolves.toBe(0);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("rejected recurrences do not project", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const approved = await prepareApprovedRecurrence(graph);
      await updateApprovedRecurrenceStatus(
        {
          companyId: graph.companyId,
          approvedRecurrenceId: approved.id,
          actorUserId: graph.userId,
          status: "rejected",
        },
        prisma,
      );

      const projection = await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 30 },
        prisma,
      );
      expect(projection).toHaveLength(0);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("temporary recurrences respect endDate and remaining installmentCount", async () => {
    const graph = await createGraph(Role.accountant);
    try {
      const approved = await prepareApprovedRecurrence(graph, {
        endDate: isoOffset(40),
        installmentCount: 6,
      });

      const projection = await generateProjection(
        { companyId: graph.companyId, actorUserId: graph.userId, horizonDays: 90 },
        prisma,
      );

      expect(projection.length).toBeLessThanOrEqual(2);
      expect(
        projection.every((item) => item.approvedRecurrenceId === approved.id),
      ).toBe(true);
      expect(
        projection.every((item) => item.date <= new Date(`${isoOffset(40)}T00:00:00.000Z`)),
      ).toBe(true);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("blocks cross-company projection generation", async () => {
    const first = await createGraph(Role.accountant);
    const second = await createGraph(Role.accountant);
    try {
      await prepareApprovedRecurrence(second);
      await expect(
        generateProjection(
          { companyId: second.companyId, actorUserId: first.userId, horizonDays: 30 },
          prisma,
        ),
      ).rejects.toBeInstanceOf(RecurrenceAuthorizationError);
    } finally {
      await cleanup(
        [first.companyId, second.companyId],
        [first.userId, second.userId],
      );
    }
  });
});
