import {
  ExpectedTransactionType,
  ImportSource,
  PendingSeverity,
  PendingStatus,
  Prisma,
  PrismaClient,
  RecurrenceFrequency,
  RecurrenceStatus,
  RecurrenceType,
  Role,
  TransactionType,
} from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const rollbackToken = Symbol("rollback");

function databaseUrl() {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for schema tests");
  }

  const databaseUrlLine = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith("DATABASE_URL="));

  if (!databaseUrlLine) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for schema tests");
  }

  return databaseUrlLine.replace("DATABASE_URL=", "").replace(/^"|"$/g, "");
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

async function rollbackingTest(
  callback: (tx: Prisma.TransactionClient, suffix: string) => Promise<void>,
) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    await prisma.$transaction(async (tx) => {
      await callback(tx, suffix);
      throw rollbackToken;
    });
  } catch (error) {
    if (error !== rollbackToken) {
      throw error;
    }
  }
}

async function createCompanyGraph(tx: Prisma.TransactionClient, suffix: string) {
  const company = await tx.company.create({
    data: {
      id: `company-${suffix}`,
      name: `Company ${suffix}`,
    },
  });
  const user = await tx.user.create({
    data: {
      id: `user-${suffix}`,
      email: `user-${suffix}@zelo.local`,
      passwordHash: "hash",
    },
  });
  const bankAccount = await tx.bankAccount.create({
    data: {
      id: `account-${suffix}`,
      companyId: company.id,
      bankName: "Itaú",
      accountNumberMasked: "****0001",
    },
  });
  const category = await tx.category.create({
    data: {
      id: `category-${suffix}`,
      companyId: company.id,
      name: `Category ${suffix}`,
      expectedTransactionType: ExpectedTransactionType.expense,
    },
  });
  const transaction = await tx.transaction.create({
    data: {
      id: `transaction-${suffix}`,
      companyId: company.id,
      bankAccountId: bankAccount.id,
      date: new Date("2026-01-10T00:00:00.000Z"),
      amount: new Prisma.Decimal("120.00"),
      type: TransactionType.expense,
      description: "Pagamento fornecedor",
      source: ImportSource.itau_xlsx,
      sourceFileId: `file-${suffix}`,
      externalId: `external-${suffix}`,
      counterpartyName: "FORNECEDOR DEMO",
    },
  });

  return {
    company,
    user,
    bankAccount,
    category,
    transaction,
  };
}

describe("schema integrity and constraints", () => {
  it("enforces one CompanyMembership per user and company", async () => {
    await rollbackingTest(async (tx, suffix) => {
      const { company, user } = await createCompanyGraph(tx, suffix);

      await tx.companyMembership.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: Role.admin,
        },
      });

      await expect(
        tx.companyMembership.create({
          data: {
            userId: user.id,
            companyId: company.id,
            role: Role.viewer,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });

  it("prevents duplicate Transaction external identity in the same company and account", async () => {
    await rollbackingTest(async (tx, suffix) => {
      const { company, bankAccount, transaction } = await createCompanyGraph(tx, suffix);

      await expect(
        tx.transaction.create({
          data: {
            companyId: company.id,
            bankAccountId: bankAccount.id,
            date: transaction.date,
            amount: transaction.amount,
            type: transaction.type,
            description: "Mesmo lançamento",
            source: transaction.source,
            sourceFileId: "another-file",
            externalId: transaction.externalId,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });

  it("blocks using a category from another company on a transaction", async () => {
    await rollbackingTest(async (tx, suffix) => {
      const first = await createCompanyGraph(tx, `${suffix}-a`);
      const second = await createCompanyGraph(tx, `${suffix}-b`);

      await expect(
        tx.transaction.update({
          where: {
            id_companyId: {
              id: first.transaction.id,
              companyId: first.company.id,
            },
          },
          data: {
            categoryId: second.category.id,
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
    });
  });

  it("blocks categorization rules pointing to a category from another company", async () => {
    await rollbackingTest(async (tx, suffix) => {
      const first = await createCompanyGraph(tx, `${suffix}-a`);
      const second = await createCompanyGraph(tx, `${suffix}-b`);

      await expect(
        tx.categorizationRule.create({
          data: {
            companyId: first.company.id,
            categoryId: second.category.id,
            ruleType: "counterparty_contains",
            conditions: { value: "FORNECEDOR" },
            priority: 100,
            confidence: 80,
            source: "manual",
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
    });
  });

  it("allows PendingItem optional references to transaction, suggestion, recurrence and duplicate", async () => {
    await rollbackingTest(async (tx, suffix) => {
      const { company, bankAccount, category, transaction } = await createCompanyGraph(tx, suffix);
      const suggestion = await tx.categorizationSuggestion.create({
        data: {
          companyId: company.id,
          transactionId: transaction.id,
          suggestedCategoryId: category.id,
          evaluationId: `evaluation-${suffix}`,
          deduplicationKey: `suggestion-${suffix}`,
          score: 65,
          confidenceBand: "medium",
          origin: "test",
          explanation: "Teste",
          evidence: {},
          engineVersion: "test",
        },
      });
      const recurrenceSuggestion = await tx.recurrenceSuggestion.create({
        data: {
          companyId: company.id,
          categoryId: category.id,
          type: TransactionType.expense,
          representativeDescription: "Assinatura",
          normalizedDescription: "assinatura",
          frequency: RecurrenceFrequency.monthly,
          recurrenceType: RecurrenceType.fixed,
          averageAmount: new Prisma.Decimal("99.90"),
          estimatedNextAmount: new Prisma.Decimal("99.90"),
          amountVariationPercent: new Prisma.Decimal("0"),
          confidenceScore: 88,
          evidence: {},
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          deduplicationKey: `recurrence-suggestion-${suffix}`,
        },
      });
      const otherTransaction = await tx.transaction.create({
        data: {
          companyId: company.id,
          bankAccountId: bankAccount.id,
          date: new Date("2026-01-11T00:00:00.000Z"),
          amount: new Prisma.Decimal("120.00"),
          type: TransactionType.expense,
          description: "Pagamento fornecedor duplicado",
          source: ImportSource.itau_pdf,
          sourceFileId: `file-2-${suffix}`,
          externalId: `external-2-${suffix}`,
        },
      });
      const duplicate = await tx.duplicateCandidate.create({
        data: {
          companyId: company.id,
          transactionId: transaction.id,
          candidateTransactionId: otherTransaction.id,
          score: 91,
          evidence: {},
        },
      });

      await expect(
        tx.pendingItem.create({
          data: {
            companyId: company.id,
            type: "categorization_review",
            severity: PendingSeverity.medium,
            transactionId: transaction.id,
            suggestionId: suggestion.id,
            recurrenceSuggestionId: recurrenceSuggestion.id,
            duplicateCandidateId: duplicate.id,
            deduplicationKey: `pending-optional-${suffix}`,
            title: "Revisar",
            description: "Revisar pendência",
            metadata: {},
          },
        }),
      ).resolves.toMatchObject({
        companyId: company.id,
        transactionId: transaction.id,
        suggestionId: suggestion.id,
        recurrenceSuggestionId: recurrenceSuggestion.id,
        duplicateCandidateId: duplicate.id,
      });
    });
  });

  it("blocks two actionable PendingItems with the same deduplicationKey", async () => {
    await rollbackingTest(async (tx, suffix) => {
      const { company } = await createCompanyGraph(tx, suffix);

      await tx.pendingItem.create({
        data: {
          companyId: company.id,
          type: "duplicate_review",
          severity: PendingSeverity.high,
          deduplicationKey: `pending-actionable-${suffix}`,
          title: "Duplicidade",
          description: "Possível duplicidade",
          metadata: {},
        },
      });

      await expect(
        tx.pendingItem.create({
          data: {
            companyId: company.id,
            type: "duplicate_review",
            status: PendingStatus.in_review,
            severity: PendingSeverity.high,
            deduplicationKey: `pending-actionable-${suffix}`,
            title: "Duplicidade",
            description: "Possível duplicidade",
            metadata: {},
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });

  it("allows the same PendingItem deduplicationKey after resolved or dismissed", async () => {
    await rollbackingTest(async (tx, suffix) => {
      const { company } = await createCompanyGraph(tx, suffix);

      await tx.pendingItem.create({
        data: {
          companyId: company.id,
          type: "duplicate_review",
          status: PendingStatus.resolved,
          severity: PendingSeverity.high,
          deduplicationKey: `pending-reopen-${suffix}`,
          title: "Resolvida",
          description: "Resolvida",
          metadata: {},
        },
      });
      await tx.pendingItem.create({
        data: {
          companyId: company.id,
          type: "duplicate_review",
          status: PendingStatus.dismissed,
          severity: PendingSeverity.high,
          deduplicationKey: `pending-reopen-${suffix}`,
          title: "Dispensada",
          description: "Dispensada",
          metadata: {},
        },
      });

      await expect(
        tx.pendingItem.create({
          data: {
            companyId: company.id,
            type: "duplicate_review",
            severity: PendingSeverity.high,
            deduplicationKey: `pending-reopen-${suffix}`,
            title: "Nova",
            description: "Nova pendência",
            metadata: {},
          },
        }),
      ).resolves.toMatchObject({
        deduplicationKey: `pending-reopen-${suffix}`,
        status: PendingStatus.open,
      });
    });
  });

  it("references duplicate candidates to both transactions", async () => {
    await rollbackingTest(async (tx, suffix) => {
      const { company, bankAccount, transaction } = await createCompanyGraph(tx, suffix);
      const candidate = await tx.transaction.create({
        data: {
          companyId: company.id,
          bankAccountId: bankAccount.id,
          date: new Date("2026-01-12T00:00:00.000Z"),
          amount: new Prisma.Decimal("120.00"),
          type: TransactionType.expense,
          description: "Pagamento fornecedor possível duplicidade",
          source: ImportSource.itau_pdf,
          sourceFileId: `file-candidate-${suffix}`,
          externalId: `external-candidate-${suffix}`,
        },
      });

      await expect(
        tx.duplicateCandidate.create({
          data: {
            companyId: company.id,
            transactionId: transaction.id,
            candidateTransactionId: candidate.id,
            score: 87,
            evidence: {},
          },
          include: {
            transaction: true,
            candidateTransaction: true,
          },
        }),
      ).resolves.toMatchObject({
        transaction: { id: transaction.id },
        candidateTransaction: { id: candidate.id },
      });
    });
  });

  it("requires ProjectedCashflowItem to link BaseScenario and ApprovedRecurrence", async () => {
    await rollbackingTest(async (tx, suffix) => {
      const { company, category, user } = await createCompanyGraph(tx, suffix);
      const scenario = await tx.baseScenario.create({
        data: {
          companyId: company.id,
          name: "Base",
        },
      });
      const recurrence = await tx.approvedRecurrence.create({
        data: {
          companyId: company.id,
          categoryId: category.id,
          type: TransactionType.expense,
          description: "Aluguel",
          frequency: RecurrenceFrequency.monthly,
          recurrenceType: RecurrenceType.fixed,
          estimatedAmount: new Prisma.Decimal("2500.00"),
          expectedDay: 5,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          status: RecurrenceStatus.active,
          approvedByUserId: user.id,
        },
      });

      await expect(
        tx.projectedCashflowItem.create({
          data: {
            companyId: company.id,
            baseScenarioId: scenario.id,
            approvedRecurrenceId: recurrence.id,
            date: new Date("2026-02-05T00:00:00.000Z"),
            amount: recurrence.estimatedAmount,
            type: recurrence.type,
            description: recurrence.description,
            horizonDays: 30,
          },
          include: {
            scenario: true,
            approvedRecurrence: true,
          },
        }),
      ).resolves.toMatchObject({
        scenario: { id: scenario.id },
        approvedRecurrence: { id: recurrence.id },
      });
    });
  });
});
