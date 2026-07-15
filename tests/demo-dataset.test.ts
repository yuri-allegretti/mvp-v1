import { access } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { importBankStatement, importUploadedBankStatement } from "../src/modules/import";
import {
  acceptCategorizationSuggestion,
  correctCategorizationSuggestion,
  rejectCategorizationSuggestion,
} from "../src/modules/categorization/services/categorizationReviewService";
import {
  approveRecurrenceSuggestion,
  editRecurrenceSuggestion,
  RecurrenceAuthorizationError,
} from "../src/modules/recurrences";
import { generateProjection } from "../src/modules/projection";
import {
  clearDemoUploadDirectories,
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
import {
  demoFixtureFiles,
  demoFixturePath,
  listDemoFixtureDescriptors,
  prepareDemoFixtures,
} from "../src/modules/demo/demoFixtures";

function databaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for demo dataset tests");
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for demo dataset tests");

  return line.replace("DATABASE_URL=", "").replace(/^"|"$/g, "");
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl(),
    },
  },
});

async function demoSetup() {
  await ensureDemoSeed(prisma);
  await resetDemoOperationalData(prisma);
  await clearDemoUploadDirectories();
  await prepareDemoFixtures();
}

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await demoSetup();
});

describe("demo dataset", () => {
  it("demo:fixtures creates the expected files and the principal fixture is importable", async () => {
    const directory = path.join(process.cwd(), "demo-fixtures");
    for (const descriptor of listDemoFixtureDescriptors()) {
      await expect(access(path.join(directory, descriptor.fileName))).resolves.toBeUndefined();
    }

    const imported = await importBankStatement({
      filePath: demoFixturePath("principal"),
      companyId: "fixture-company",
      bankAccountId: "fixture-account",
      sourceFileId: "fixture-source-1",
    });

    expect(imported.report.errors).toEqual([]);
    expect(imported.report.detectedBank).toBe("itau");
    expect(imported.report.detectedFormat).toBe("xlsx");
    expect(imported.transactions).toHaveLength(46);
  });

  it("demo:reset clears operational data and preserves the seeded base", async () => {
    await importUploadedBankStatement(
      {
        companyId: demoCompanyId,
        bankAccountId: demoBankAccountId,
        uploadedByUserId: demoAccountantUserId,
        filePath: demoFixturePath("principal"),
        originalFileName: demoFixtureFiles.principal,
      },
      prisma,
    );

    await expect(
      prisma.transaction.count({ where: { companyId: demoCompanyId } }),
    ).resolves.toBeGreaterThan(0);

    await resetDemoOperationalData(prisma);
    await clearDemoUploadDirectories();

    await expect(
      prisma.transaction.count({ where: { companyId: demoCompanyId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.recurrenceSuggestion.count({ where: { companyId: demoCompanyId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.company.findUnique({ where: { id: demoCompanyId } }),
    ).resolves.toBeTruthy();
    await expect(
      prisma.company.findUnique({ where: { id: demoIsolationCompanyId } }),
    ).resolves.toBeTruthy();
    await expect(
      prisma.companyMembership.count({ where: { companyId: demoCompanyId } }),
    ).resolves.toBe(3);
    await expect(
      prisma.bankAccount.count({ where: { companyId: demoCompanyId } }),
    ).resolves.toBe(2);
    await expect(
      prisma.category.count({ where: { companyId: demoCompanyId } }),
    ).resolves.toBeGreaterThanOrEqual(15);
    await expect(
      prisma.categorizationRule.count({ where: { companyId: demoCompanyId } }),
    ).resolves.toBeGreaterThanOrEqual(10);
  });

  it("runs the seeded demo flow end-to-end with idempotency, permissions and isolation", async () => {
    const firstImport = await importUploadedBankStatement(
      {
        companyId: demoCompanyId,
        bankAccountId: demoBankAccountId,
        uploadedByUserId: demoAccountantUserId,
        filePath: demoFixturePath("principal"),
        originalFileName: demoFixtureFiles.principal,
      },
      prisma,
    );

    expect(firstImport.transactionsCreated).toBe(46);
    expect(firstImport.duplicatesSkipped).toBe(0);
    expect(firstImport.postProcessing.categorizationSuggestions).toBeGreaterThan(0);
    expect(firstImport.postProcessing.pendingItemsCreated).toBeGreaterThan(0);
    expect(firstImport.postProcessing.recurrenceSuggestionsCreated).toBeGreaterThan(0);
    expect(firstImport.postProcessing.recurrenceApprovalPendingsCreated).toBeGreaterThan(0);

    const suggestionBands = await prisma.categorizationSuggestion.groupBy({
      by: ["confidenceBand"],
      where: { companyId: demoCompanyId },
      _count: { _all: true },
    });
    const bandCount = new Map(suggestionBands.map((entry) => [entry.confidenceBand, entry._count._all]));
    expect(bandCount.get("high") ?? 0).toBeGreaterThan(0);
    expect(bandCount.get("medium") ?? 0).toBeGreaterThan(0);
    expect(bandCount.get("low") ?? 0).toBeGreaterThan(0);

    const pendingTypes = await prisma.pendingItem.groupBy({
      by: ["type"],
      where: { companyId: demoCompanyId, status: { in: ["open", "in_review"] } },
      _count: { _all: true },
    });
    const pendingCount = new Map(pendingTypes.map((entry) => [entry.type, entry._count._all]));
    for (const type of [
      "categorization_review",
      "categorization_low_confidence",
      "categorization_conflict",
      "uncategorized_transaction",
      "possible_duplicate",
      "recurrence_approval",
    ]) {
      expect(pendingCount.get(type) ?? 0).toBeGreaterThan(0);
    }

    const recurrenceKinds = await prisma.recurrenceSuggestion.findMany({
      where: { companyId: demoCompanyId },
      select: { patternKind: true, recurrenceType: true },
    });
    expect(recurrenceKinds.length).toBeGreaterThan(0);
    expect(recurrenceKinds.some((entry) => entry.recurrenceType === "fixed")).toBe(true);
    expect(recurrenceKinds.some((entry) => entry.recurrenceType === "variable")).toBe(true);
    expect(recurrenceKinds.some((entry) => entry.patternKind === "installment")).toBe(true);

    const mediumSuggestion = await prisma.categorizationSuggestion.findFirstOrThrow({
      where: {
        companyId: demoCompanyId,
        confidenceBand: "medium",
        transaction: { description: { contains: "META ADS" } },
      },
      select: { id: true, transactionId: true },
    });
    await acceptCategorizationSuggestion(
      {
        companyId: demoCompanyId,
        suggestionId: mediumSuggestion.id,
        actorUserId: demoAccountantUserId,
        reason: "Aceite demo test",
      },
      prisma,
    );
    await expect(
      prisma.transaction.findUniqueOrThrow({
        where: { id_companyId: { id: mediumSuggestion.transactionId, companyId: demoCompanyId } },
      }),
    ).resolves.toMatchObject({ categoryId: expect.any(String) });

    const conflictSuggestion = await prisma.categorizationSuggestion.findFirstOrThrow({
      where: {
        companyId: demoCompanyId,
        transaction: { description: { contains: "ACME CLOUD" } },
      },
      select: { id: true, transactionId: true },
    });
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
        reason: "Correcao demo test",
      },
      prisma,
    );
    await expect(
      prisma.transaction.findUniqueOrThrow({
        where: { id_companyId: { id: conflictSuggestion.transactionId, companyId: demoCompanyId } },
      }),
    ).resolves.toMatchObject({ categoryId: fornecedorCategory.id });

    const lowSuggestion = await prisma.categorizationSuggestion.findFirstOrThrow({
      where: {
        companyId: demoCompanyId,
        confidenceBand: "low",
        transaction: { description: { contains: "MERCADO CENTRAL" } },
      },
      select: { id: true, transactionId: true },
    });
    await rejectCategorizationSuggestion(
      {
        companyId: demoCompanyId,
        suggestionId: lowSuggestion.id,
        actorUserId: demoAccountantUserId,
        reason: "Rejeicao demo test",
      },
      prisma,
    );
    await expect(
      prisma.categorizationSuggestion.findUniqueOrThrow({
        where: { id_companyId: { id: lowSuggestion.id, companyId: demoCompanyId } },
      }),
    ).resolves.toMatchObject({ status: "rejected" });

    const recurrenceSuggestion = await prisma.recurrenceSuggestion.findFirstOrThrow({
      where: {
        companyId: demoCompanyId,
        status: { in: ["pending", "edited"] },
        installmentCount: null,
        frequency: { not: "unknown" },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await editRecurrenceSuggestion(
      {
        companyId: demoCompanyId,
        suggestionId: recurrenceSuggestion.id,
        actorUserId: demoAdminUserId,
        nextDate: tomorrow,
        reason: "Adjust recurrence for projection",
      },
      prisma,
    );
    const approved = await approveRecurrenceSuggestion(
      {
        companyId: demoCompanyId,
        suggestionId: recurrenceSuggestion.id,
        actorUserId: demoAdminUserId,
        reason: "Approve recurrence for demo dataset test",
      },
      prisma,
    );
    expect(approved.status).toBe("active");

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
    expect(projection30.length).toBeGreaterThan(0);
    expect(projection60.length).toBeGreaterThan(0);
    expect(projection90.length).toBeGreaterThan(0);
    expect(rerun30).toHaveLength(projection30.length);

    const secondImport = await importUploadedBankStatement(
      {
        companyId: demoCompanyId,
        bankAccountId: demoBankAccountId,
        uploadedByUserId: demoAccountantUserId,
        filePath: demoFixturePath("reimport"),
        originalFileName: demoFixtureFiles.reimport,
      },
      prisma,
    );
    expect(secondImport.transactionsCreated).toBe(0);
    expect(secondImport.duplicatesSkipped).toBe(46);

    await expect(
      importUploadedBankStatement(
        {
          companyId: demoCompanyId,
          bankAccountId: demoBankAccountId,
          uploadedByUserId: demoViewerUserId,
          filePath: demoFixturePath("principal"),
          originalFileName: demoFixtureFiles.principal,
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "IMPORT_FORBIDDEN" });

    await expect(
      approveRecurrenceSuggestion(
        {
          companyId: demoCompanyId,
          suggestionId: recurrenceSuggestion.id,
          actorUserId: demoViewerUserId,
        },
        prisma,
      ),
    ).rejects.toBeInstanceOf(RecurrenceAuthorizationError);

    const secondAccountImport = await importUploadedBankStatement(
      {
        companyId: demoCompanyId,
        bankAccountId: demoSecondaryBankAccountId,
        uploadedByUserId: demoAccountantUserId,
        filePath: demoFixturePath("secondAccount"),
        originalFileName: demoFixtureFiles.secondAccount,
      },
      prisma,
    );
    expect(secondAccountImport.transactionsCreated).toBeGreaterThan(0);

    const duplicateImport = await importUploadedBankStatement(
      {
        companyId: demoCompanyId,
        bankAccountId: demoBankAccountId,
        uploadedByUserId: demoAccountantUserId,
        filePath: demoFixturePath("duplicates"),
        originalFileName: demoFixtureFiles.duplicates,
      },
      prisma,
    );
    expect(duplicateImport.transactionsCreated).toBeGreaterThan(0);
    await expect(
      prisma.duplicateCandidate.count({ where: { companyId: demoCompanyId } }),
    ).resolves.toBeGreaterThan(0);

    const demoCountBeforeIsolation = await prisma.transaction.count({
      where: { companyId: demoCompanyId },
    });
    const isolationImport = await importUploadedBankStatement(
      {
        companyId: demoIsolationCompanyId,
        bankAccountId: demoIsolationBankAccountId,
        uploadedByUserId: demoAccountantUserId,
        filePath: demoFixturePath("isolation"),
        originalFileName: demoFixtureFiles.isolation,
      },
      prisma,
    );
    expect(isolationImport.transactionsCreated).toBeGreaterThan(0);
    await expect(
      prisma.transaction.count({ where: { companyId: demoCompanyId } }),
    ).resolves.toBe(demoCountBeforeIsolation);
    await expect(
      prisma.transaction.count({ where: { companyId: demoIsolationCompanyId } }),
    ).resolves.toBe(isolationImport.transactionsCreated);
  }, 30000);
});
