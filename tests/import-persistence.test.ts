import { PrismaClient, Role } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  BankImportIntegrationError,
  importUploadedBankStatement,
} from "../src/modules/import";

const fixturesDirectory = path.join(process.cwd(), "tests", "fixtures", "import");
const xlsFixture = path.join(fixturesDirectory, "Extrato Conta Corrente-200620262150.xls");
const pdfFixture = path.join(fixturesDirectory, "extrato-itau_20_06_2026_21-54.pdf");

function databaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for import tests");
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for import tests");

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

async function cleanup(companyIds: string[], userIds: string[]) {
  await prisma.projectedCashflowItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.auditEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.pendingItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.duplicateCandidate.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.approvedRecurrence.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.recurrenceSuggestionTransaction.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.recurrenceSuggestion.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.categorizationSuggestion.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.categorizationRule.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.importedTransactionRaw.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.importIssue.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.bankImport.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.importedTransactionRaw.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.transaction.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.category.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.uploadedFile.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.bankAccount.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.companyMembership.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

async function createImportGraph(role: Role, suffix = crypto.randomUUID()) {
  const companyId = `import-company-${suffix}`;
  const userId = `import-user-${suffix}`;
  const bankAccountId = `import-account-${suffix}`;

  const company = await prisma.company.create({
    data: {
      id: companyId,
      name: `Import Company ${suffix}`,
    },
  });
  const user = await prisma.user.create({
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
  const bankAccount = await prisma.bankAccount.create({
    data: {
      id: bankAccountId,
      companyId,
      bankName: "Itaú",
      agency: "0001",
      accountNumberMasked: "****1234",
    },
  });

  return { company, user, bankAccount };
}

async function seedFixtureCategorization(companyId: string) {
  await prisma.category.createMany({
    data: [
      {
        id: `cat-impostos-${companyId}`,
        companyId,
        name: "Impostos",
        expectedTransactionType: "expense",
      },
      {
        id: `cat-fornecedor-${companyId}`,
        companyId,
        name: "Fornecedor",
        expectedTransactionType: "expense",
      },
    ],
  });

  await prisma.categorizationRule.createMany({
    data: [
      {
        id: `rule-iof-${companyId}`,
        companyId,
        categoryId: `cat-impostos-${companyId}`,
        ruleType: "description_contains",
        conditions: { value: "IOF" },
        priority: 920,
        confidence: 94,
        source: "manual",
      },
      {
        id: `rule-copel-${companyId}`,
        companyId,
        categoryId: `cat-fornecedor-${companyId}`,
        ruleType: "counterparty_contains",
        conditions: { value: "COPEL" },
        priority: 760,
        confidence: 91,
        source: "manual",
      },
    ],
  });
}

function runImport(params: {
  companyId: string;
  bankAccountId: string;
  uploadedByUserId: string;
  filePath: string;
  originalFileName: string;
}) {
  return importUploadedBankStatement(params, prisma);
}

describe("Itaú import persistence integration", () => {
  it("persists UploadedFile, BankImport, raw evidence and 36 Transactions from XLS", async () => {
    const graph = await createImportGraph(Role.accountant);
    try {
      const result = await runImport({
        companyId: graph.company.id,
        bankAccountId: graph.bankAccount.id,
        uploadedByUserId: graph.user.id,
        filePath: xlsFixture,
        originalFileName: "Extrato Conta Corrente-200620262150.xls",
      });

      expect(result.transactionsCreated).toBe(36);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.invalidRows).toBe(0);
      expect(result.categorizationTriggered).toBe(true);
      expect(result.postProcessing.categorizationSuggestions).toBeGreaterThanOrEqual(0);
      expect(result.postProcessing.pendingItemsCreated).toBeGreaterThanOrEqual(1);
      expect(result.postProcessing.recurrenceSuggestionsCreated).toBeGreaterThanOrEqual(0);

      await expect(
        prisma.bankImport.findUniqueOrThrow({
          where: { id: result.bankImportId },
          include: { uploadedFile: true },
        }),
      ).resolves.toMatchObject({
        companyId: graph.company.id,
        bankAccountId: graph.bankAccount.id,
        uploadedFileId: result.uploadedFileId,
        detectedBank: "itau",
        detectedFormat: "xls",
        importedTransactions: 36,
        duplicateTransactions: 0,
        uploadedFile: {
          id: result.uploadedFileId,
          companyId: graph.company.id,
        },
      });

      await expect(
        prisma.transaction.count({ where: { companyId: graph.company.id } }),
      ).resolves.toBe(36);
      await expect(
        prisma.importedTransactionRaw.count({
          where: { companyId: graph.company.id, status: "imported" },
        }),
      ).resolves.toBe(36);
      await expect(
        prisma.transaction.findFirstOrThrow({
          where: {
            companyId: graph.company.id,
            description: { startsWith: "DA COPEL" },
          },
        }),
      ).resolves.toMatchObject({
        counterpartyName: "COPEL",
        documentNumber: "0000001778170",
      });
      await expect(
        prisma.importedTransactionRaw.findFirstOrThrow({
          where: {
            companyId: graph.company.id,
            description: { startsWith: "DA COPEL" },
          },
        }),
      ).resolves.toMatchObject({
        counterpartyName: "COPEL",
        documentNumber: "0000001778170",
      });
      await expect(
        prisma.importIssue.count({
          where: {
            companyId: graph.company.id,
            bankImportId: result.bankImportId,
            code: "FUTURE_TRANSACTION_SKIPPED",
          },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.pendingItem.count({
          where: {
            companyId: graph.company.id,
            type: "uncategorized_transaction",
          },
        }),
      ).resolves.toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup([graph.company.id], [graph.user.id]);
    }
  }, 15000);

  it("runs post-import categorization, pending generation and recurrence detection automatically", async () => {
    const graph = await createImportGraph(Role.accountant);
    try {
      await seedFixtureCategorization(graph.company.id);

      const result = await runImport({
        companyId: graph.company.id,
        bankAccountId: graph.bankAccount.id,
        uploadedByUserId: graph.user.id,
        filePath: xlsFixture,
        originalFileName: "Extrato Conta Corrente-200620262150.xls",
      });

      expect(result.transactionsCreated).toBe(36);
      expect(result.postProcessing.categorizedTransactions).toBeGreaterThanOrEqual(2);
      expect(result.postProcessing.categorizationSuggestions).toBeGreaterThanOrEqual(2);
      expect(result.postProcessing.pendingItemsCreated).toBeGreaterThanOrEqual(1);
      expect(result.postProcessing.recurrenceSuggestionsCreated).toBeGreaterThanOrEqual(1);
      expect(result.postProcessing.recurrenceApprovalPendingsCreated).toBeGreaterThanOrEqual(1);

      await expect(
        prisma.categorizationSuggestion.count({
          where: { companyId: graph.company.id },
        }),
      ).resolves.toBeGreaterThanOrEqual(2);
      await expect(
        prisma.pendingItem.count({
          where: {
            companyId: graph.company.id,
            type: { in: ["categorization_review", "categorization_low_confidence", "categorization_conflict", "uncategorized_transaction"] },
          },
        }),
      ).resolves.toBeGreaterThanOrEqual(1);
      await expect(
        prisma.recurrenceSuggestion.count({
          where: { companyId: graph.company.id },
        }),
      ).resolves.toBeGreaterThanOrEqual(1);
      await expect(
        prisma.pendingItem.count({
          where: {
            companyId: graph.company.id,
            type: "recurrence_approval",
            status: { in: ["open", "in_review"] },
          },
        }),
      ).resolves.toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup([graph.company.id], [graph.user.id]);
    }
  }, 15000);

  it("does not duplicate Transactions when the same XLS is imported again", async () => {
    const graph = await createImportGraph(Role.accountant);
    try {
      await seedFixtureCategorization(graph.company.id);
      await runImport({
        companyId: graph.company.id,
        bankAccountId: graph.bankAccount.id,
        uploadedByUserId: graph.user.id,
        filePath: xlsFixture,
        originalFileName: "Extrato Conta Corrente-200620262150.xls",
      });
      const second = await runImport({
        companyId: graph.company.id,
        bankAccountId: graph.bankAccount.id,
        uploadedByUserId: graph.user.id,
        filePath: xlsFixture,
        originalFileName: "Extrato Conta Corrente-200620262150.xls",
      });

      expect(second.transactionsCreated).toBe(0);
      expect(second.duplicatesSkipped).toBe(36);
      expect(second.postProcessing.categorizationSuggestions).toBe(0);
      expect(second.postProcessing.pendingItemsCreated).toBe(0);
      expect(second.postProcessing.duplicateCandidatesCreated).toBe(0);
      expect(second.postProcessing.recurrenceSuggestionsCreated).toBe(0);
      expect(second.postProcessing.recurrenceApprovalPendingsCreated).toBe(0);
      await expect(
        prisma.transaction.count({ where: { companyId: graph.company.id } }),
      ).resolves.toBe(36);
      await expect(
        prisma.importedTransactionRaw.count({
          where: { companyId: graph.company.id, status: "duplicate" },
        }),
      ).resolves.toBe(36);
      await expect(
        prisma.recurrenceSuggestion.count({ where: { companyId: graph.company.id } }),
      ).resolves.toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup([graph.company.id], [graph.user.id]);
    }
  });

  it("does not duplicate equivalent PDF after XLS", async () => {
    const graph = await createImportGraph(Role.accountant);
    try {
      await runImport({
        companyId: graph.company.id,
        bankAccountId: graph.bankAccount.id,
        uploadedByUserId: graph.user.id,
        filePath: xlsFixture,
        originalFileName: "Extrato Conta Corrente-200620262150.xls",
      });
      const pdf = await runImport({
        companyId: graph.company.id,
        bankAccountId: graph.bankAccount.id,
        uploadedByUserId: graph.user.id,
        filePath: pdfFixture,
        originalFileName: "extrato-itau_20_06_2026_21-54.pdf",
      });

      expect(pdf.transactionsCreated).toBe(0);
      expect(pdf.duplicatesSkipped).toBe(36);
      await expect(
        prisma.bankImport.findUniqueOrThrow({ where: { id: pdf.bankImportId } }),
      ).resolves.toMatchObject({
        detectedFormat: "pdf",
        importedTransactions: 0,
        duplicateTransactions: 36,
      });
      await expect(
        prisma.transaction.count({ where: { companyId: graph.company.id } }),
      ).resolves.toBe(36);
    } finally {
      await cleanup([graph.company.id], [graph.user.id]);
    }
  });

  it("blocks viewer uploads before creating UploadedFile", async () => {
    const graph = await createImportGraph(Role.viewer);
    try {
      await expect(
        runImport({
          companyId: graph.company.id,
          bankAccountId: graph.bankAccount.id,
          uploadedByUserId: graph.user.id,
          filePath: xlsFixture,
          originalFileName: "Extrato Conta Corrente-200620262150.xls",
        }),
      ).rejects.toMatchObject({
        code: "IMPORT_FORBIDDEN",
      });
      await expect(
        prisma.uploadedFile.count({ where: { companyId: graph.company.id } }),
      ).resolves.toBe(0);
    } finally {
      await cleanup([graph.company.id], [graph.user.id]);
    }
  });

  it("blocks importing into another company's bank account", async () => {
    const first = await createImportGraph(Role.accountant);
    const second = await createImportGraph(Role.accountant);
    try {
      await expect(
        runImport({
          companyId: first.company.id,
          bankAccountId: second.bankAccount.id,
          uploadedByUserId: first.user.id,
          filePath: xlsFixture,
          originalFileName: "Extrato Conta Corrente-200620262150.xls",
        }),
      ).rejects.toBeInstanceOf(BankImportIntegrationError);
      await expect(
        prisma.uploadedFile.count({ where: { companyId: first.company.id } }),
      ).resolves.toBe(0);
    } finally {
      await cleanup(
        [first.company.id, second.company.id],
        [first.user.id, second.user.id],
      );
    }
  });

  it("keeps Transaction idempotency under two concurrent XLS imports", async () => {
    const graph = await createImportGraph(Role.accountant);
    try {
      const [first, second] = await Promise.all([
        runImport({
          companyId: graph.company.id,
          bankAccountId: graph.bankAccount.id,
          uploadedByUserId: graph.user.id,
          filePath: xlsFixture,
          originalFileName: "Extrato Conta Corrente-200620262150.xls",
        }),
        runImport({
          companyId: graph.company.id,
          bankAccountId: graph.bankAccount.id,
          uploadedByUserId: graph.user.id,
          filePath: xlsFixture,
          originalFileName: "Extrato Conta Corrente-200620262150.xls",
        }),
      ]);

      expect(first.transactionsCreated + second.transactionsCreated).toBe(36);
      expect(first.duplicatesSkipped + second.duplicatesSkipped).toBe(36);
      await expect(
        prisma.transaction.count({ where: { companyId: graph.company.id } }),
      ).resolves.toBe(36);
    } finally {
      await cleanup([graph.company.id], [graph.user.id]);
    }
  });
});
