import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { importUploadedBankStatement } from "../src/modules/import";
import { categorizeImportedTransactions, categorizeTransactions } from "../src/modules/categorization";
import {
  approveRecurrenceSuggestion,
  detectRecurrenceSuggestionsForCompany,
  editRecurrenceSuggestion,
} from "../src/modules/recurrences";
import { ensureBaseScenario, generateProjection } from "../src/modules/projection";

const demoCompanyId = "demo-company";
const demoAccountId = "demo-itau-account";
const demoAccountantUserId = "demo-accountant";
const xlsFixture = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "import",
  "Extrato Conta Corrente-200620262150.xls",
);

function tomorrowDate(): Date {
  const value = new Date();
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + 1));
}

async function main() {
  const company = await prisma.company.findUnique({
    where: { id: demoCompanyId },
    select: { id: true, name: true },
  });
  if (!company) {
    throw new Error("Demo company not found. Run prisma seed first.");
  }

  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      id: demoAccountId,
      companyId: demoCompanyId,
    },
    select: { id: true },
  });
  if (!bankAccount) {
    throw new Error("Demo bank account not found. Run prisma seed first.");
  }

  const existingTransactionCount = await prisma.transaction.count({
    where: { companyId: demoCompanyId },
  });

  let importedBankImportId: string | null = null;
  if (existingTransactionCount === 0) {
    const importResult = await importUploadedBankStatement(
      {
        companyId: demoCompanyId,
        bankAccountId: demoAccountId,
        uploadedByUserId: demoAccountantUserId,
        filePath: xlsFixture,
        originalFileName: path.basename(xlsFixture),
      },
      prisma,
    );
    importedBankImportId = importResult.bankImportId;
  }

  if (importedBankImportId) {
    await categorizeImportedTransactions(
      {
        companyId: demoCompanyId,
        bankImportId: importedBankImportId,
      },
      prisma,
    );
  } else {
    const uncategorizedTransactions = await prisma.transaction.findMany({
      where: {
        companyId: demoCompanyId,
        categoryId: null,
      },
      select: { id: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });

    if (uncategorizedTransactions.length > 0) {
      await categorizeTransactions(
        {
          companyId: demoCompanyId,
          transactionIds: uncategorizedTransactions.map((transaction) => transaction.id),
        },
        prisma,
      );
    }
  }

  await detectRecurrenceSuggestionsForCompany({ companyId: demoCompanyId }, prisma);

  const eligibleSuggestion = await prisma.recurrenceSuggestion.findFirst({
    where: {
      companyId: demoCompanyId,
      status: { in: ["pending", "edited"] },
      approvedRecurrences: {
        none: {},
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  if (eligibleSuggestion) {
    await editRecurrenceSuggestion(
      {
        companyId: demoCompanyId,
        suggestionId: eligibleSuggestion.id,
        actorUserId: demoAccountantUserId,
        nextDate: tomorrowDate(),
      },
      prisma,
    );

    await approveRecurrenceSuggestion(
      {
        companyId: demoCompanyId,
        suggestionId: eligibleSuggestion.id,
        actorUserId: demoAccountantUserId,
        reason: "Automatic approval for technical demo only",
      },
      prisma,
    );
  }

  const firstActiveApprovedRecurrence = await prisma.approvedRecurrence.findFirst({
    where: {
      companyId: demoCompanyId,
      status: "active",
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nextDate: true,
      installmentCount: true,
    },
  });

  if (firstActiveApprovedRecurrence) {
    await prisma.approvedRecurrence.update({
      where: {
        id_companyId: {
          id: firstActiveApprovedRecurrence.id,
          companyId: demoCompanyId,
        },
      },
      data: {
        nextDate: tomorrowDate(),
        endDate: null,
        installmentCount: null,
        status: "active",
      },
    });
  }

  const baseScenario = await ensureBaseScenario(demoCompanyId, prisma);
  await generateProjection(
    {
      companyId: demoCompanyId,
      actorUserId: demoAccountantUserId,
      horizonDays: 30,
    },
    prisma,
  );
  await generateProjection(
    {
      companyId: demoCompanyId,
      actorUserId: demoAccountantUserId,
      horizonDays: 60,
    },
    prisma,
  );
  await generateProjection(
    {
      companyId: demoCompanyId,
      actorUserId: demoAccountantUserId,
      horizonDays: 90,
    },
    prisma,
  );

  const [
    totalTransactions,
    totalCategorizationSuggestions,
    totalPending,
    totalRecurrenceSuggestions,
    totalApprovedRecurrences,
    projected30,
    projected60,
    projected90,
  ] = await Promise.all([
    prisma.transaction.count({ where: { companyId: demoCompanyId } }),
    prisma.categorizationSuggestion.count({ where: { companyId: demoCompanyId } }),
    prisma.pendingItem.count({ where: { companyId: demoCompanyId, status: { in: ["open", "in_review"] } } }),
    prisma.recurrenceSuggestion.count({ where: { companyId: demoCompanyId } }),
    prisma.approvedRecurrence.count({ where: { companyId: demoCompanyId } }),
    prisma.projectedCashflowItem.count({
      where: { companyId: demoCompanyId, baseScenarioId: baseScenario.id, horizonDays: 30 },
    }),
    prisma.projectedCashflowItem.count({
      where: { companyId: demoCompanyId, baseScenarioId: baseScenario.id, horizonDays: 60 },
    }),
    prisma.projectedCashflowItem.count({
      where: { companyId: demoCompanyId, baseScenarioId: baseScenario.id, horizonDays: 90 },
    }),
  ]);

  console.log(`Demo company: ${company.name} (${company.id})`);
  console.log(`Base scenario: ${baseScenario.name} (${baseScenario.id})`);
  console.log(`Total transactions: ${totalTransactions}`);
  console.log(`Total categorization suggestions: ${totalCategorizationSuggestions}`);
  console.log(`Total open pending items: ${totalPending}`);
  console.log(`Total recurrence suggestions: ${totalRecurrenceSuggestions}`);
  console.log(`Total approved recurrences: ${totalApprovedRecurrences}`);
  console.log(`Projected items (30 days): ${projected30}`);
  console.log(`Projected items (60 days): ${projected60}`);
  console.log(`Projected items (90 days): ${projected90}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
