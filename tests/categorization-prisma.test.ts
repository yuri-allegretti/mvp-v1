import {
  CategorizationRuleSource,
  CategorizationRuleStatus,
  CategorizationRuleType,
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
import { importUploadedBankStatement } from "../src/modules/import";
import {
  ConcurrencyError,
  DomainInvariantError,
  PendingTypes,
  categorizeImportedTransactions,
  createCategorizationServices,
} from "../src/modules/categorization";

const fixturesDirectory = path.join(process.cwd(), "tests", "fixtures", "import");
const xlsFixture = path.join(fixturesDirectory, "Extrato Conta Corrente-200620262150.xls");

function databaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for categorization tests");
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for categorization tests");
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

async function cleanup(companyIds: string[], userIds: string[]) {
  await prisma.projectedCashflowItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.approvedRecurrence.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.recurrenceSuggestionTransaction.deleteMany({
    where: { companyId: { in: companyIds } },
  });
  await prisma.recurrenceSuggestion.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.auditEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.pendingItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.categorizationSuggestion.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.importedTransactionRaw.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.importIssue.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.bankImport.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.transaction.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.categorizationRule.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.category.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.uploadedFile.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.bankAccount.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.baseScenario.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.companyMembership.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

async function cleanupDemoImport() {
  const companyId = "demo-company";
  await prisma.auditEvent.deleteMany({ where: { companyId } });
  await prisma.pendingItem.deleteMany({ where: { companyId } });
  await prisma.projectedCashflowItem.deleteMany({ where: { companyId } });
  await prisma.approvedRecurrence.deleteMany({ where: { companyId } });
  await prisma.recurrenceSuggestionTransaction.deleteMany({ where: { companyId } });
  await prisma.recurrenceSuggestion.deleteMany({ where: { companyId } });
  await prisma.categorizationSuggestion.deleteMany({ where: { companyId } });
  await prisma.importedTransactionRaw.deleteMany({ where: { companyId } });
  await prisma.importIssue.deleteMany({ where: { companyId } });
  await prisma.bankImport.deleteMany({ where: { companyId } });
  await prisma.transaction.deleteMany({ where: { companyId } });
  await prisma.uploadedFile.deleteMany({ where: { companyId } });
}

async function createGraph(role: Role = Role.accountant): Promise<TestGraph> {
  const suffix = crypto.randomUUID();
  const companyId = `cat-company-${suffix}`;
  const userId = `cat-user-${suffix}`;
  const bankAccountId = `cat-account-${suffix}`;

  await prisma.company.create({
    data: {
      id: companyId,
      name: `Categorization Company ${suffix}`,
    },
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
      bankName: "Itaú",
      accountNumberMasked: "****1234",
    },
  });

  return { companyId, userId, bankAccountId };
}

async function createCategory(
  graph: TestGraph,
  overrides: {
    id?: string;
    name?: string;
    expectedTransactionType?: ExpectedTransactionType;
    isActive?: boolean;
  } = {},
) {
  const id = overrides.id ?? `cat-${crypto.randomUUID()}`;
  return prisma.category.create({
    data: {
      id,
      companyId: graph.companyId,
      name: overrides.name ?? `Categoria ${id}`,
      expectedTransactionType:
        overrides.expectedTransactionType ?? ExpectedTransactionType.expense,
      isActive: overrides.isActive ?? true,
    },
  });
}

async function createTransaction(
  graph: TestGraph,
  overrides: {
    id?: string;
    amount?: string;
    type?: TransactionType;
    description?: string;
    counterpartyName?: string | null;
    documentNumber?: string | null;
    categoryId?: string | null;
  } = {},
) {
  const id = overrides.id ?? `tx-${crypto.randomUUID()}`;
  return prisma.transaction.create({
    data: {
      id,
      companyId: graph.companyId,
      bankAccountId: graph.bankAccountId,
      date: new Date("2026-06-01T00:00:00.000Z"),
      amount: new Prisma.Decimal(overrides.amount ?? "-100.00"),
      type: overrides.type ?? TransactionType.expense,
      description: overrides.description ?? "Pagamento fornecedor ACME",
      source: ImportSource.itau_xlsx,
      sourceFileId: `source-${crypto.randomUUID()}`,
      externalId: `external-${crypto.randomUUID()}`,
      counterpartyName: overrides.counterpartyName ?? "ACME LTDA",
      documentNumber: overrides.documentNumber ?? null,
      categoryId: overrides.categoryId ?? null,
    },
  });
}

async function createRule(
  graph: TestGraph,
  categoryId: string,
  overrides: {
    id?: string;
    ruleType?: CategorizationRuleType;
    conditions?: Prisma.InputJsonValue;
    confidence?: number;
    priority?: number;
    status?: CategorizationRuleStatus;
  } = {},
) {
  const id = overrides.id ?? `rule-${crypto.randomUUID()}`;
  return prisma.categorizationRule.create({
    data: {
      id,
      companyId: graph.companyId,
      categoryId,
      ruleType: overrides.ruleType ?? CategorizationRuleType.counterparty_contains,
      conditions: overrides.conditions ?? { value: "ACME" },
      priority: overrides.priority ?? 500,
      confidence: overrides.confidence ?? 75,
      status: overrides.status ?? CategorizationRuleStatus.active,
      source: CategorizationRuleSource.manual,
    },
  });
}

function categorization() {
  return createCategorizationServices(prisma);
}

describe("categorization Prisma integration", () => {
  it("creates categories per company and allows the same name in different companies", async () => {
    const first = await createGraph();
    const second = await createGraph();
    try {
      const firstCategory = await createCategory(first, { name: "Software" });
      const secondCategory = await createCategory(second, { name: "Software" });

      expect(firstCategory.companyId).toBe(first.companyId);
      expect(secondCategory.companyId).toBe(second.companyId);
      expect(firstCategory.id).not.toBe(secondCategory.id);
    } finally {
      await cleanup([first.companyId, second.companyId], [first.userId, second.userId]);
    }
  });

  it("active rules generate a category suggestion", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph);
      const transaction = await createTransaction(graph);
      await createRule(graph, category.id, { confidence: 75 });

      const result = await categorization().engine.process(graph.companyId, transaction.id);

      expect(result.outcome).toBe("pending");
      await expect(
        prisma.categorizationSuggestion.findFirstOrThrow({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toMatchObject({
        suggestedCategoryId: category.id,
        confidenceBand: "medium",
        status: "generated",
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("high confidence without conflict applies category automatically", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph);
      const transaction = await createTransaction(graph);
      await createRule(graph, category.id, { confidence: 95, priority: 900 });

      const result = await categorization().engine.process(graph.companyId, transaction.id);

      expect(result.outcome).toBe("automatically_applied");
      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: category.id });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: { companyId: graph.companyId, action: "categorization.auto_applied" },
        }),
      ).resolves.toMatchObject({
        decisionMode: "automatic",
        finalCategoryId: category.id,
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("medium confidence creates pending and does not alter Transaction.categoryId", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph);
      const transaction = await createTransaction(graph);
      await createRule(graph, category.id, { confidence: 75 });

      await categorization().engine.process(graph.companyId, transaction.id);

      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: null });
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toMatchObject({
        type: PendingTypes.categorizationReview,
        status: "open",
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("low confidence creates pending and does not alter Transaction.categoryId", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph);
      const transaction = await createTransaction(graph);
      await createRule(graph, category.id, { confidence: 40 });

      await categorization().engine.process(graph.companyId, transaction.id);

      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: null });
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toMatchObject({
        type: PendingTypes.categorizationLowConfidence,
        status: "open",
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("conflict creates multiple suggestions and blocks auto-application", async () => {
    const graph = await createGraph();
    try {
      const firstCategory = await createCategory(graph, { name: "Fornecedor" });
      const secondCategory = await createCategory(graph, { name: "Software" });
      const transaction = await createTransaction(graph, {
        description: "Pagamento cloud ACME",
        counterpartyName: "ACME LTDA",
      });
      await createRule(graph, firstCategory.id, {
        ruleType: CategorizationRuleType.counterparty_contains,
        conditions: { value: "ACME" },
        confidence: 96,
        priority: 900,
      });
      await createRule(graph, secondCategory.id, {
        ruleType: CategorizationRuleType.description_contains,
        conditions: { value: "cloud" },
        confidence: 95,
        priority: 800,
      });

      await categorization().engine.process(graph.companyId, transaction.id);

      await expect(
        prisma.categorizationSuggestion.count({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toBe(2);
      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: null });
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toMatchObject({ type: PendingTypes.categorizationConflict });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("inactive categories are not applied automatically", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph, { isActive: false });
      const transaction = await createTransaction(graph);
      await createRule(graph, category.id, { confidence: 95 });

      await categorization().engine.process(graph.companyId, transaction.id);

      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: null });
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toMatchObject({
        type: PendingTypes.categorizationReview,
        status: "open",
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("categories incompatible with transaction type are not applied automatically", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph, {
        expectedTransactionType: ExpectedTransactionType.income,
      });
      const transaction = await createTransaction(graph, {
        type: TransactionType.expense,
        amount: "-250.00",
      });
      await createRule(graph, category.id, { confidence: 95 });

      await categorization().engine.process(graph.companyId, transaction.id);

      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: null });
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toMatchObject({
        type: PendingTypes.categorizationReview,
        status: "open",
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("manual acceptance updates category, suggestion, pending and audit", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph);
      const transaction = await createTransaction(graph);
      await createRule(graph, category.id, { confidence: 75 });
      const result = await categorization().engine.process(graph.companyId, transaction.id);
      if (result.outcome !== "pending" || !result.suggestions[0]) {
        throw new Error("Expected pending suggestion");
      }

      await categorization().decisionService.acceptSuggestion({
        companyId: graph.companyId,
        transactionId: transaction.id,
        suggestionId: result.suggestions[0].id,
        actorUserId: graph.userId,
      });

      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: category.id });
      await expect(
        prisma.categorizationSuggestion.findUniqueOrThrow({
          where: {
            id_companyId: { id: result.suggestions[0].id, companyId: graph.companyId },
          },
        }),
      ).resolves.toMatchObject({ status: "accepted" });
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toMatchObject({ status: "resolved", resolvedByUserId: graph.userId });
      await expect(
        prisma.auditEvent.count({
          where: {
            companyId: graph.companyId,
            action: { in: ["categorization.suggestion_accepted", "pending.resolved"] },
          },
        }),
      ).resolves.toBe(2);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("manual correction updates category, suggestion, pending and audit", async () => {
    const graph = await createGraph();
    try {
      const suggested = await createCategory(graph, { name: "Suggested" });
      const corrected = await createCategory(graph, { name: "Corrected" });
      const transaction = await createTransaction(graph);
      await createRule(graph, suggested.id, { confidence: 75 });
      const result = await categorization().engine.process(graph.companyId, transaction.id);
      if (result.outcome !== "pending" || !result.suggestions[0]) {
        throw new Error("Expected pending suggestion");
      }

      await categorization().decisionService.correctCategory({
        companyId: graph.companyId,
        transactionId: transaction.id,
        suggestionId: result.suggestions[0].id,
        finalCategoryId: corrected.id,
        actorUserId: graph.userId,
        reason: "Categoria correta pelo contador",
      });

      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: corrected.id });
      await expect(
        prisma.categorizationSuggestion.findUniqueOrThrow({
          where: {
            id_companyId: { id: result.suggestions[0].id, companyId: graph.companyId },
          },
        }),
      ).resolves.toMatchObject({ status: "corrected" });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: { companyId: graph.companyId, action: "categorization.corrected" },
        }),
      ).resolves.toMatchObject({
        actorUserId: graph.userId,
        finalCategoryId: corrected.id,
        reason: "Categoria correta pelo contador",
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("manual rejection keeps category unchanged and dismisses pending", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph);
      const transaction = await createTransaction(graph);
      await createRule(graph, category.id, { confidence: 75 });
      const result = await categorization().engine.process(graph.companyId, transaction.id);
      if (result.outcome !== "pending" || !result.suggestions[0]) {
        throw new Error("Expected pending suggestion");
      }

      await categorization().decisionService.rejectSuggestion({
        companyId: graph.companyId,
        transactionId: transaction.id,
        suggestionId: result.suggestions[0].id,
        actorUserId: graph.userId,
        reason: "Não se aplica",
      });

      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: null });
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toMatchObject({ status: "dismissed" });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: { companyId: graph.companyId, action: "categorization.suggestion_rejected" },
        }),
      ).resolves.toMatchObject({ decisionMode: "rejected", finalCategoryId: null });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("marking undefined clears category when applicable and audits", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph);
      const transaction = await createTransaction(graph);
      await createRule(graph, category.id, { confidence: 95 });
      await categorization().engine.process(graph.companyId, transaction.id);

      await categorization().decisionService.markUndefined({
        companyId: graph.companyId,
        transactionId: transaction.id,
        actorUserId: graph.userId,
        reason: "Sem contexto suficiente",
      });

      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: null });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: { companyId: graph.companyId, action: "categorization.marked_undefined" },
        }),
      ).resolves.toMatchObject({
        decisionMode: "undefined_decision",
        previousCategoryId: category.id,
        finalCategoryId: null,
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("blocks cross-company category, rule, suggestion and pending references", async () => {
    const first = await createGraph();
    const second = await createGraph();
    try {
      const firstCategory = await createCategory(first, { name: "First" });
      const secondCategory = await createCategory(second, { name: "Second" });
      const firstTransaction = await createTransaction(first);
      const secondTransaction = await createTransaction(second);

      await expect(
        categorization().decisionService.correctCategory({
          companyId: first.companyId,
          transactionId: firstTransaction.id,
          finalCategoryId: secondCategory.id,
          actorUserId: first.userId,
          reason: "cross-company",
        }),
      ).rejects.toThrow();

      await expect(
        prisma.categorizationRule.create({
          data: {
            companyId: first.companyId,
            categoryId: secondCategory.id,
            ruleType: "description_contains",
            conditions: { value: "ACME" },
            priority: 1,
            confidence: 90,
            source: "manual",
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });

      await expect(
        prisma.categorizationSuggestion.create({
          data: {
            companyId: first.companyId,
            transactionId: firstTransaction.id,
            suggestedCategoryId: secondCategory.id,
            evaluationId: `cross-${crypto.randomUUID()}`,
            deduplicationKey: `cross-${crypto.randomUUID()}`,
            score: 90,
            confidenceBand: "high",
            origin: "manual_rule",
            explanation: "cross",
            evidence: {},
            engineVersion: "test",
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });

      await expect(
        prisma.pendingItem.create({
          data: {
            companyId: first.companyId,
            type: PendingTypes.categorizationReview,
            severity: "medium",
            transactionId: secondTransaction.id,
            deduplicationKey: `cross-pending-${crypto.randomUUID()}`,
            title: "cross",
            description: "cross",
            metadata: {},
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });

      expect(firstCategory.companyId).toBe(first.companyId);
    } finally {
      await cleanup(
        [first.companyId, second.companyId],
        [first.userId, second.userId],
      );
    }
  });

  it("blocks conflicting concurrent reviews of the same pending item", async () => {
    const graph = await createGraph();
    try {
      const suggested = await createCategory(graph, { name: "Suggested" });
      const corrected = await createCategory(graph, { name: "Corrected" });
      const transaction = await createTransaction(graph);
      await createRule(graph, suggested.id, { confidence: 75 });
      const result = await categorization().engine.process(graph.companyId, transaction.id);
      if (result.outcome !== "pending" || !result.suggestions[0]) {
        throw new Error("Expected pending suggestion");
      }

      const decisions = await Promise.allSettled([
        categorization().decisionService.acceptSuggestion({
          companyId: graph.companyId,
          transactionId: transaction.id,
          suggestionId: result.suggestions[0].id,
          actorUserId: graph.userId,
        }),
        categorization().decisionService.correctCategory({
          companyId: graph.companyId,
          transactionId: transaction.id,
          suggestionId: result.suggestions[0].id,
          finalCategoryId: corrected.id,
          actorUserId: graph.userId,
          reason: "Correção concorrente",
        }),
      ]);

      expect(decisions.filter((item) => item.status === "fulfilled")).toHaveLength(1);
      const rejected = decisions.find((item) => item.status === "rejected");
      expect(rejected?.status).toBe("rejected");
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(ConcurrencyError);
      }
      await expect(
        prisma.auditEvent.count({
          where: {
            companyId: graph.companyId,
            action: {
              in: ["categorization.suggestion_accepted", "categorization.corrected"],
            },
          },
        }),
      ).resolves.toBe(1);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("does not recategorize a transaction that already has categoryId", async () => {
    const graph = await createGraph();
    try {
      const existing = await createCategory(graph, { name: "Existing" });
      const candidate = await createCategory(graph, { name: "Candidate" });
      const transaction = await createTransaction(graph, { categoryId: existing.id });
      await createRule(graph, candidate.id, { confidence: 95 });

      const result = await categorization().engine.process(graph.companyId, transaction.id);

      expect(result.outcome).toBe("already_categorized");
      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id_companyId: { id: transaction.id, companyId: graph.companyId } },
        }),
      ).resolves.toMatchObject({ categoryId: existing.id });
      await expect(
        prisma.categorizationSuggestion.count({
          where: { companyId: graph.companyId, transactionId: transaction.id },
        }),
      ).resolves.toBe(0);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("categorization does not create recurrence suggestions or projected cashflow items", async () => {
    const graph = await createGraph();
    try {
      const category = await createCategory(graph);
      const transaction = await createTransaction(graph);
      await createRule(graph, category.id, { confidence: 95 });

      await categorization().engine.process(graph.companyId, transaction.id);

      await expect(
        prisma.recurrenceSuggestion.count({ where: { companyId: graph.companyId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.projectedCashflowItem.count({ where: { companyId: graph.companyId } }),
      ).resolves.toBe(0);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("categorizes imported XLS transactions using seeded demo rules", async () => {
    await cleanupDemoImport();
    try {
      await expect(
        prisma.company.findUniqueOrThrow({ where: { id: "demo-company" } }),
      ).resolves.toBeTruthy();

      const imported = await importUploadedBankStatement(
        {
          companyId: "demo-company",
          bankAccountId: "demo-itau-account",
          uploadedByUserId: "demo-accountant",
          filePath: xlsFixture,
          originalFileName: "Extrato Conta Corrente-200620262150.xls",
        },
        prisma,
      );
      expect(imported.transactionsCreated).toBe(36);

      const batch = await categorizeImportedTransactions(
        {
          companyId: "demo-company",
          bankImportId: imported.bankImportId,
        },
        prisma,
      );

      expect(batch.processed).toBe(36);
      expect(batch.automaticallyApplied).toBeGreaterThanOrEqual(2);
      await expect(
        prisma.transaction.count({
          where: {
            companyId: "demo-company",
            categoryId: { not: null },
          },
        }),
      ).resolves.toBeGreaterThanOrEqual(2);
      await expect(
        prisma.recurrenceSuggestion.count({ where: { companyId: "demo-company" } }),
      ).resolves.toBe(0);
      await expect(
        prisma.projectedCashflowItem.count({ where: { companyId: "demo-company" } }),
      ).resolves.toBe(0);
    } finally {
      await cleanupDemoImport();
    }
  });
});
