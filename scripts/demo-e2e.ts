import { prisma } from "../src/lib/prisma";
import { demoFixturePath, prepareDemoFixtures } from "../src/modules/demo/demoFixtures";
import {
  demoAccountantUserId,
  demoAdminUserId,
  demoBankAccountId,
  demoCompanyId,
  demoIsolationBankAccountId,
  demoIsolationCompanyId,
  demoSecondaryBankAccountId,
  demoViewerUserId,
  ensureDemoSeed,
  resetDemoOperationalData,
} from "../src/modules/demo/demoSetup";
import { importUploadedBankStatement, BankImportIntegrationError } from "../src/modules/import";
import {
  acceptCategorizationSuggestion,
  correctCategorizationSuggestion,
  rejectCategorizationSuggestion,
  listCategorizationSuggestions,
} from "../src/modules/categorization/services/categorizationReviewService";
import {
  approveRecurrenceSuggestion,
  editRecurrenceSuggestion,
  requireRecurrenceManagementPermission,
} from "../src/modules/recurrences";
import { generateProjection } from "../src/modules/projection";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectViewerBlocked() {
  try {
    await importUploadedBankStatement(
      {
        companyId: demoCompanyId,
        bankAccountId: demoBankAccountId,
        uploadedByUserId: demoViewerUserId,
        filePath: demoFixturePath("principal"),
        originalFileName: "01-itau-demo-principal.xlsx",
      },
      prisma,
    );
    throw new Error("Viewer import should have been blocked");
  } catch (error) {
    assert(
      error instanceof BankImportIntegrationError && error.code === "IMPORT_FORBIDDEN",
      "Viewer was not blocked from import:create",
    );
  }

  try {
    await requireRecurrenceManagementPermission(prisma, demoCompanyId, demoViewerUserId);
    throw new Error("Viewer recurrence management should have been blocked");
  } catch (error) {
    assert(error instanceof Error, "Viewer recurrence permission should fail");
  }
}

async function main() {
  await ensureDemoSeed(prisma);
  await resetDemoOperationalData(prisma);
  await prepareDemoFixtures();

  await expectViewerBlocked();

  const firstImport = await importUploadedBankStatement(
    {
      companyId: demoCompanyId,
      bankAccountId: demoBankAccountId,
      uploadedByUserId: demoAccountantUserId,
      filePath: demoFixturePath("principal"),
      originalFileName: "01-itau-demo-principal.xlsx",
    },
    prisma,
  );

  assert(firstImport.transactionsCreated >= 40, "Principal fixture should create at least 40 transactions");
  assert(firstImport.postProcessing.categorizationSuggestions > 0, "Expected categorization suggestions");
  assert(firstImport.postProcessing.pendingItemsCreated > 0, "Expected pending items");
  assert(firstImport.postProcessing.recurrenceSuggestionsCreated > 0, "Expected recurrence suggestions");
  assert(firstImport.postProcessing.recurrenceApprovalPendingsCreated > 0, "Expected recurrence approval pendings");

  const suggestionBands = await prisma.categorizationSuggestion.groupBy({
    by: ["confidenceBand"],
    where: { companyId: demoCompanyId },
    _count: { _all: true },
  });
  const bandCount = new Map(suggestionBands.map((entry) => [entry.confidenceBand, entry._count._all]));
  assert((bandCount.get("high") ?? 0) > 0, "Expected high confidence suggestions");
  assert((bandCount.get("medium") ?? 0) > 0, "Expected medium confidence suggestions");
  assert((bandCount.get("low") ?? 0) > 0, "Expected low confidence suggestions");

  const pendingByType = await prisma.pendingItem.groupBy({
    by: ["type"],
    where: { companyId: demoCompanyId, status: { in: ["open", "in_review"] } },
    _count: { _all: true },
  });
  const pendingCount = new Map(pendingByType.map((entry) => [entry.type, entry._count._all]));
  for (const type of [
    "categorization_review",
    "categorization_low_confidence",
    "categorization_conflict",
    "uncategorized_transaction",
    "possible_duplicate",
    "recurrence_approval",
  ]) {
    assert((pendingCount.get(type) ?? 0) > 0, `Expected pending type ${type}`);
  }

  const mediumSuggestion = await prisma.categorizationSuggestion.findFirst({
    where: {
      companyId: demoCompanyId,
      confidenceBand: "medium",
      transaction: { description: { contains: "META ADS" } },
    },
  });
  assert(mediumSuggestion, "Expected META ADS medium suggestion");
  await acceptCategorizationSuggestion(
    {
      companyId: demoCompanyId,
      suggestionId: mediumSuggestion.id,
      actorUserId: demoAccountantUserId,
      reason: "Aceite tecnico demo:e2e",
    },
    prisma,
  );

  const conflictSuggestion = await prisma.categorizationSuggestion.findFirst({
    where: {
      companyId: demoCompanyId,
      transaction: { description: { contains: "ACME CLOUD" } },
    },
  });
  assert(conflictSuggestion, "Expected ACME CLOUD conflict suggestion");
  const fornecedorCategory = await prisma.category.findFirstOrThrow({
    where: { companyId: demoCompanyId, name: "Fornecedor" },
    select: { id: true },
  });
  await correctCategorizationSuggestion(
    {
      companyId: demoCompanyId,
      suggestionId: conflictSuggestion.id,
      actorUserId: demoAccountantUserId,
      categoryId: fornecedorCategory.id,
      reason: "Correcao tecnica demo:e2e",
    },
    prisma,
  );

  const lowSuggestion = await prisma.categorizationSuggestion.findFirst({
    where: {
      companyId: demoCompanyId,
      confidenceBand: "low",
      transaction: { description: { contains: "MERCADO CENTRAL" } },
    },
  });
  assert(lowSuggestion, "Expected MERCADO CENTRAL low suggestion");
  await rejectCategorizationSuggestion(
    {
      companyId: demoCompanyId,
      suggestionId: lowSuggestion.id,
      actorUserId: demoAccountantUserId,
      reason: "Rejeicao tecnica demo:e2e",
    },
    prisma,
  );

  const recurrenceSuggestion = await prisma.recurrenceSuggestion.findFirst({
    where: {
      companyId: demoCompanyId,
      status: { in: ["pending", "edited"] },
      installmentCount: null,
      frequency: { not: "unknown" },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  assert(recurrenceSuggestion, "Expected at least one pending recurrence suggestion");
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  await editRecurrenceSuggestion(
    {
      companyId: demoCompanyId,
      suggestionId: recurrenceSuggestion.id,
      actorUserId: demoAdminUserId,
      nextDate: tomorrow,
      reason: "Preparacao tecnica demo:e2e",
    },
    prisma,
  );
  const approved = await approveRecurrenceSuggestion(
    {
      companyId: demoCompanyId,
      suggestionId: recurrenceSuggestion.id,
      actorUserId: demoAdminUserId,
      reason: "Aprovacao tecnica demo:e2e",
    },
    prisma,
  );
  assert(approved.status === "active", "Approved recurrence should remain active");

  const projection30 = await generateProjection(
    { companyId: demoCompanyId, actorUserId: demoAccountantUserId, horizonDays: 30 },
    prisma,
  );
  const projection60 = await generateProjection(
    { companyId: demoCompanyId, actorUserId: demoAccountantUserId, horizonDays: 60 },
    prisma,
  );
  const projection90 = await generateProjection(
    { companyId: demoCompanyId, actorUserId: demoAccountantUserId, horizonDays: 90 },
    prisma,
  );
  const rerun30 = await generateProjection(
    { companyId: demoCompanyId, actorUserId: demoAccountantUserId, horizonDays: 30 },
    prisma,
  );

  assert(projection30.length > 0, "Expected 30-day projection");
  assert(projection60.length > 0, "Expected 60-day projection");
  assert(projection90.length > 0, "Expected 90-day projection");
  assert(rerun30.length === projection30.length, "Projection regeneration must be idempotent");

  const secondImport = await importUploadedBankStatement(
    {
      companyId: demoCompanyId,
      bankAccountId: demoBankAccountId,
      uploadedByUserId: demoAccountantUserId,
      filePath: demoFixturePath("reimport"),
      originalFileName: "02-itau-demo-reimportacao.xlsx",
    },
    prisma,
  );
  assert(secondImport.transactionsCreated === 0, "Reimport should not create new transactions");
  assert(
    secondImport.duplicatesSkipped === firstImport.transactionsCreated,
    "Reimport should skip all original transactions",
  );

  const secondAccountImport = await importUploadedBankStatement(
    {
      companyId: demoCompanyId,
      bankAccountId: demoSecondaryBankAccountId,
      uploadedByUserId: demoAccountantUserId,
      filePath: demoFixturePath("secondAccount"),
      originalFileName: "04-itau-demo-segunda-conta.xlsx",
    },
    prisma,
  );
  assert(secondAccountImport.transactionsCreated > 0, "Second account fixture should import");

  const duplicateImport = await importUploadedBankStatement(
    {
      companyId: demoCompanyId,
      bankAccountId: demoBankAccountId,
      uploadedByUserId: demoAccountantUserId,
      filePath: demoFixturePath("duplicates"),
      originalFileName: "03-itau-demo-duplicidades-possiveis.xlsx",
    },
    prisma,
  );
  assert(duplicateImport.transactionsCreated > 0, "Duplicate fixture should import transactions");
  const duplicateCount = await prisma.duplicateCandidate.count({
    where: { companyId: demoCompanyId },
  });
  assert(duplicateCount > 0, "Expected duplicate candidates");

  const demoTransactionCountBeforeIsolation = await prisma.transaction.count({
    where: { companyId: demoCompanyId },
  });
  const isolationImport = await importUploadedBankStatement(
    {
      companyId: demoIsolationCompanyId,
      bankAccountId: demoIsolationBankAccountId,
      uploadedByUserId: demoAccountantUserId,
      filePath: demoFixturePath("isolation"),
      originalFileName: "05-itau-demo-isolamento-empresa.xlsx",
    },
    prisma,
  );
  assert(isolationImport.transactionsCreated > 0, "Isolation fixture should import");
  const demoTransactionCountAfterIsolation = await prisma.transaction.count({
    where: { companyId: demoCompanyId },
  });
  assert(
    demoTransactionCountBeforeIsolation === demoTransactionCountAfterIsolation,
    "Isolation import must not leak data into Empresa Demo",
  );

  const isolationSuggestions = await listCategorizationSuggestions(
    {
      companyId: demoIsolationCompanyId,
      pendingOnly: true,
    },
    prisma,
  );
  assert(
    isolationSuggestions.every((suggestion) => suggestion.companyId === demoIsolationCompanyId),
    "Isolation company suggestions must remain scoped",
  );

  console.log(
    JSON.stringify(
      {
        transactionsDemo: demoTransactionCountAfterIsolation,
        transactionsIsolation: await prisma.transaction.count({
          where: { companyId: demoIsolationCompanyId },
        }),
        duplicateCandidates: duplicateCount,
        projection30: projection30.length,
        projection60: projection60.length,
        projection90: projection90.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
