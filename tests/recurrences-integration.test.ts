import {
  ExpectedTransactionType,
  ImportSource,
  Prisma,
  PrismaClient,
  TransactionType,
  type Transaction,
} from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  detectRecurrenceSuggestionsForCompany,
  recurrenceApprovalType,
  transactionToRecurrenceInput,
} from "../src/modules/recurrences";
import {
  categorizeTransactions,
  createCategorizationServices,
} from "../src/modules/categorization";

function databaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for recurrence tests");
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for recurrence tests");

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

async function cleanup(companyIds: string[], userIds: string[]) {
  await prisma.projectedCashflowItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.approvedRecurrence.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.pendingItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.auditEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.recurrenceSuggestionTransaction.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.recurrenceSuggestion.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.categorizationSuggestion.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.categorizationRule.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.transaction.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.category.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.bankAccount.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.companyMembership.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

async function createGraph(): Promise<TestGraph> {
  const suffix = crypto.randomUUID();
  const companyId = `rec-company-${suffix}`;
  const userId = `rec-user-${suffix}`;
  const bankAccountId = `rec-account-${suffix}`;

  await prisma.company.create({
    data: { id: companyId, name: `Recurrence Company ${suffix}` },
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
      role: "accountant",
    },
  });
  await prisma.bankAccount.create({
    data: {
      id: bankAccountId,
      companyId,
      bankName: "Itaú",
      accountNumberMasked: "****9876",
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
    type?: TransactionType;
    description?: string;
    counterpartyName?: string | null;
    documentNumber?: string | null;
    externalId?: string;
    source?: ImportSource;
    categoryId?: string | null;
  },
) {
  return prisma.transaction.create({
    data: {
      id: overrides.id ?? `rec-tx-${crypto.randomUUID()}`,
      companyId: graph.companyId,
      bankAccountId: graph.bankAccountId,
      date: new Date(`${overrides.date ?? "2026-01-05"}T00:00:00.000Z`),
      amount: new Prisma.Decimal(overrides.amount ?? "-39.90"),
      type: overrides.type ?? TransactionType.expense,
      description: overrides.description ?? "NETFLIX.COM",
      source: overrides.source ?? ImportSource.itau_xlsx,
      sourceFileId: `rec-source-${crypto.randomUUID()}`,
      externalId: overrides.externalId ?? `rec-external-${crypto.randomUUID()}`,
      counterpartyName: overrides.counterpartyName ?? "NETFLIX",
      documentNumber: overrides.documentNumber ?? null,
      categoryId: overrides.categoryId ?? null,
    },
  });
}

async function createMonthlyNetflixSeries(graph: TestGraph, categoryId?: string | null) {
  return Promise.all([
    createTransaction(graph, {
      id: `${graph.companyId}-n1`,
      date: "2026-01-05",
      description: "NETFLIX.COM",
      externalId: `${graph.companyId}-ext-n1`,
      categoryId,
    }),
    createTransaction(graph, {
      id: `${graph.companyId}-n2`,
      date: "2026-02-05",
      description: "PAGAMENTO NETFLIX",
      externalId: `${graph.companyId}-ext-n2`,
      categoryId,
    }),
    createTransaction(graph, {
      id: `${graph.companyId}-n3`,
      date: "2026-03-05",
      description: "NETFLIX SERVICOS DIGITAIS",
      externalId: `${graph.companyId}-ext-n3`,
      categoryId,
    }),
    createTransaction(graph, {
      id: `${graph.companyId}-n4`,
      date: "2026-04-05",
      description: "COMPRA NETFLIX.COM",
      externalId: `${graph.companyId}-ext-n4`,
      categoryId,
    }),
  ]);
}

describe("recurrence adapter", () => {
  it("converts Decimal amount to number", () => {
    const transaction = {
      id: "tx-1",
      companyId: "company-1",
      bankAccountId: "account-1",
      date: new Date("2026-01-05T00:00:00.000Z"),
      amount: new Prisma.Decimal("-39.90"),
      type: "expense",
      description: "NETFLIX.COM",
      source: "itau_xlsx",
      sourceFileId: "file-1",
      externalId: "external-1",
      counterpartyName: "NETFLIX",
      documentNumber: null,
      categoryId: "category-1",
    } as Transaction;

    expect(transactionToRecurrenceInput(transaction)).toMatchObject({
      amount: -39.9,
      categoryId: "category-1",
    });
  });

  it("converts Date to YYYY-MM-DD", () => {
    const transaction = {
      id: "tx-1",
      companyId: "company-1",
      bankAccountId: "account-1",
      date: new Date("2026-02-15T13:20:00.000Z"),
      amount: new Prisma.Decimal("-10.00"),
      type: "expense",
      description: "Teste",
      source: "itau_pdf",
      sourceFileId: "file-1",
      externalId: "external-1",
      counterpartyName: null,
      documentNumber: null,
      categoryId: null,
    } as Transaction;

    expect(transactionToRecurrenceInput(transaction).date).toBe("2026-02-15");
  });

  it("maps Itaú sources to csv without changing detector core", () => {
    for (const source of [ImportSource.itau_xls, ImportSource.itau_xlsx, ImportSource.itau_pdf]) {
      const transaction = {
        id: `tx-${source}`,
        companyId: "company-1",
        bankAccountId: "account-1",
        date: new Date("2026-01-05T00:00:00.000Z"),
        amount: new Prisma.Decimal("-10.00"),
        type: "expense",
        description: "Teste",
        source,
        sourceFileId: "file-1",
        externalId: `external-${source}`,
        counterpartyName: null,
        documentNumber: null,
        categoryId: null,
      } as Transaction;

      expect(transactionToRecurrenceInput(transaction).source).toBe("csv");
    }
  });
});

describe("recurrence detection workflow", () => {
  it("runs detector over persisted canonical transactions and persists suggestions", async () => {
    const graph = await createGraph();
    try {
      await createMonthlyNetflixSeries(graph);

      const result = await detectRecurrenceSuggestionsForCompany(
        { companyId: graph.companyId },
        prisma,
      );

      expect(result.processedTransactions).toBe(4);
      expect(result.detectedSuggestions).toBeGreaterThanOrEqual(1);
      expect(result.suggestionsCreated).toBeGreaterThanOrEqual(1);
      await expect(
        prisma.recurrenceSuggestion.count({ where: { companyId: graph.companyId } }),
      ).resolves.toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("persists RecurrenceSuggestionTransaction links", async () => {
    const graph = await createGraph();
    try {
      const transactions = await createMonthlyNetflixSeries(graph);
      await detectRecurrenceSuggestionsForCompany({ companyId: graph.companyId }, prisma);

      await expect(
        prisma.recurrenceSuggestionTransaction.count({
          where: {
            companyId: graph.companyId,
            transactionId: { in: transactions.map((transaction) => transaction.id) },
          },
        }),
      ).resolves.toBe(4);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("does not duplicate suggestions when run twice over the same logical set", async () => {
    const graph = await createGraph();
    try {
      await createMonthlyNetflixSeries(graph);
      const first = await detectRecurrenceSuggestionsForCompany({ companyId: graph.companyId }, prisma);
      const second = await detectRecurrenceSuggestionsForCompany({ companyId: graph.companyId }, prisma);

      expect(first.suggestionsCreated).toBeGreaterThanOrEqual(1);
      expect(second.suggestionsCreated).toBe(0);
      expect(second.pendingCreated).toBe(0);
      await expect(
        prisma.recurrenceSuggestion.count({ where: { companyId: graph.companyId } }),
      ).resolves.toBe(first.suggestionsCreated);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("creates recurrence approval pending items", async () => {
    const graph = await createGraph();
    try {
      await createMonthlyNetflixSeries(graph);
      const result = await detectRecurrenceSuggestionsForCompany(
        { companyId: graph.companyId },
        prisma,
      );

      expect(result.pendingCreated).toBeGreaterThanOrEqual(1);
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, type: recurrenceApprovalType },
        }),
      ).resolves.toMatchObject({
        status: "open",
        recurrenceSuggestionId: result.suggestions[0]?.id,
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("recurrence approval pending respects the actionable partial index", async () => {
    const graph = await createGraph();
    try {
      await createMonthlyNetflixSeries(graph);
      await detectRecurrenceSuggestionsForCompany({ companyId: graph.companyId }, prisma);
      const pending = await prisma.pendingItem.findFirstOrThrow({
        where: { companyId: graph.companyId, type: recurrenceApprovalType },
      });

      await expect(
        prisma.pendingItem.create({
          data: {
            companyId: graph.companyId,
            type: recurrenceApprovalType,
            status: "open",
            severity: "medium",
            recurrenceSuggestionId: pending.recurrenceSuggestionId,
            deduplicationKey: pending.deduplicationKey,
            title: "Duplicada",
            description: "Duplicada",
            metadata: {},
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("blocks cross-company recurrence suggestions and transaction links", async () => {
    const first = await createGraph();
    const second = await createGraph();
    try {
      const firstCategory = await prisma.category.create({
        data: {
          id: `rec-category-${crypto.randomUUID()}`,
          companyId: first.companyId,
          name: "Software",
          expectedTransactionType: ExpectedTransactionType.expense,
        },
      });
      const secondTransaction = await createTransaction(second, {});

      await expect(
        prisma.recurrenceSuggestion.create({
          data: {
            companyId: second.companyId,
            categoryId: firstCategory.id,
            type: "expense",
            representativeDescription: "NETFLIX",
            normalizedDescription: "netflix",
            frequency: "monthly",
            recurrenceType: "fixed",
            averageAmount: new Prisma.Decimal("39.90"),
            estimatedNextAmount: new Prisma.Decimal("39.90"),
            amountVariationPercent: new Prisma.Decimal("0"),
            confidenceScore: 90,
            evidence: {},
            startDate: new Date("2026-01-05T00:00:00.000Z"),
            deduplicationKey: `cross-rec-${crypto.randomUUID()}`,
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });

      await createMonthlyNetflixSeries(first);
      const result = await detectRecurrenceSuggestionsForCompany({ companyId: first.companyId }, prisma);
      const suggestion = result.suggestions[0];
      if (!suggestion) throw new Error("Expected recurrence suggestion");

      await expect(
        prisma.recurrenceSuggestionTransaction.create({
          data: {
            companyId: first.companyId,
            recurrenceSuggestionId: suggestion.id,
            transactionId: secondTransaction.id,
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
    } finally {
      await cleanup(
        [first.companyId, second.companyId],
        [first.userId, second.userId],
      );
    }
  });

  it("does not use another company's transactions to form a suggestion", async () => {
    const first = await createGraph();
    const second = await createGraph();
    try {
      const foreignTransactions = await createMonthlyNetflixSeries(second);

      const result = await detectRecurrenceSuggestionsForCompany(
        {
          companyId: first.companyId,
          transactionIds: foreignTransactions.map((transaction) => transaction.id),
        },
        prisma,
      );

      expect(result.processedTransactions).toBe(0);
      expect(result.detectedSuggestions).toBe(0);
      await expect(
        prisma.recurrenceSuggestion.count({ where: { companyId: first.companyId } }),
      ).resolves.toBe(0);
    } finally {
      await cleanup(
        [first.companyId, second.companyId],
        [first.userId, second.userId],
      );
    }
  });

  it("categorization still does not create recurrence suggestions by itself", async () => {
    const graph = await createGraph();
    try {
      const category = await prisma.category.create({
        data: {
          id: `cat-${crypto.randomUUID()}`,
          companyId: graph.companyId,
          name: "Software",
          expectedTransactionType: "expense",
        },
      });
      const transaction = await createTransaction(graph, {
        description: "NETFLIX.COM",
        counterpartyName: "NETFLIX",
      });
      await prisma.categorizationRule.create({
        data: {
          companyId: graph.companyId,
          categoryId: category.id,
          ruleType: "counterparty_contains",
          conditions: { value: "NETFLIX" },
          priority: 900,
          confidence: 95,
          source: "manual",
        },
      });

      await categorizeTransactions(
        { companyId: graph.companyId, transactionIds: [transaction.id] },
        prisma,
      );
      expect(createCategorizationServices(prisma)).toBeTruthy();

      await expect(
        prisma.recurrenceSuggestion.count({ where: { companyId: graph.companyId } }),
      ).resolves.toBe(0);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("suggested recurrence does not create ApprovedRecurrence or ProjectedCashflowItem", async () => {
    const graph = await createGraph();
    try {
      await createMonthlyNetflixSeries(graph);
      await detectRecurrenceSuggestionsForCompany({ companyId: graph.companyId }, prisma);

      await expect(
        prisma.approvedRecurrence.count({ where: { companyId: graph.companyId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.projectedCashflowItem.count({ where: { companyId: graph.companyId } }),
      ).resolves.toBe(0);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });
});
