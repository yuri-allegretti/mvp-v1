import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const baseUrl = "http://127.0.0.1:3000";
const companyIds = [1, 2, 3, 4, 5].map(
  (number) => `published-company-${String(number).padStart(3, "0")}`,
);
const accountantId = "published-fixture-accountant";
const adminId = "published-fixture-admin";
const viewerId = "published-fixture-viewer";

async function post(url: string, actor: string, body: object): Promise<Response> {
  return fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": actor },
    body: JSON.stringify(body),
  });
}

async function main(): Promise<void> {
  const where = { companyId: { in: companyIds } };
  const pendingByType = await prisma.pendingItem.groupBy({
    by: ["type"],
    where: { ...where, status: { in: ["open", "in_review"] } },
    _count: true,
    orderBy: { _count: { type: "desc" } },
  });
  const suggestionsByBand = await prisma.categorizationSuggestion.groupBy({
    by: ["confidenceBand"],
    where,
    _count: true,
  });
  const categorizedByCompany = await prisma.transaction.groupBy({
    by: ["companyId"],
    where: { ...where, categoryId: { not: null } },
    _count: true,
    orderBy: { companyId: "asc" },
  });
  const categorizedByCategory = await prisma.transaction.groupBy({
    by: ["companyId", "categoryId"],
    where: { ...where, categoryId: { not: null } },
    _count: true,
    orderBy: [{ companyId: "asc" }, { categoryId: "asc" }],
  });
  const transactionSignals = {
    counterparty: await prisma.transaction.count({
      where: { ...where, counterpartyName: { not: null } },
    }),
    document: await prisma.transaction.count({
      where: { ...where, documentNumber: { not: null } },
    }),
  };
  const recurrencesByPattern = await prisma.recurrenceSuggestion.groupBy({
    by: ["patternKind"],
    where: { ...where, status: { in: ["pending", "edited"] } },
    _count: true,
  });
  const recurrenceSuggestionsByStatus = await prisma.recurrenceSuggestion.groupBy({
    by: ["status"],
    where,
    _count: true,
  });
  const pendingItemsByStatus = await prisma.pendingItem.groupBy({
    by: ["status"],
    where,
    _count: true,
  });
  const recurrenceRows = await prisma.recurrenceSuggestion.findMany({
    where: { ...where, status: { in: ["pending", "edited"] } },
    select: { companyId: true, normalizedDescription: true, patternKind: true },
  });
  const distinctRecurrenceKeys = new Set(
    recurrenceRows.map(
      (item) => `${item.companyId}|${item.normalizedDescription}|${item.patternKind}`,
    ),
  ).size;

  const suggestion = await prisma.recurrenceSuggestion.findFirst({
    where: { companyId: companyIds[0], status: "pending" },
    orderBy: { confidenceScore: "desc" },
  });
  let projection: Record<string, unknown> | null = null;
  let viewerProjectionStatus: number | null = null;
  if (suggestion) {
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDate = next.toISOString().slice(0, 10);
    const approval = await post(
      `/api/companies/${companyIds[0]}/recurrences/${suggestion.id}/approve?userId=${accountantId}`,
      accountantId,
      { nextDate, endDate: null, installmentCount: null },
    );
    const regeneration = await post(
      `/api/companies/${companyIds[0]}/projection/base/regenerate?userId=${accountantId}`,
      accountantId,
      {},
    );
    const firstProjection = (await regeneration.json()) as {
      horizons: Record<string, unknown[]>;
    };
    const secondRegeneration = await post(
      `/api/companies/${companyIds[0]}/projection/base/regenerate?userId=${accountantId}`,
      accountantId,
      {},
    );
    const secondProjection = (await secondRegeneration.json()) as {
      horizons: Record<string, unknown[]>;
    };
    projection = {
      approvalStatus: approval.status,
      first: Object.fromEntries(
        Object.entries(firstProjection.horizons).map(([key, value]) => [key, value.length]),
      ),
      second: Object.fromEntries(
        Object.entries(secondProjection.horizons).map(([key, value]) => [key, value.length]),
      ),
    };
    viewerProjectionStatus = (
      await post(
        `/api/companies/${companyIds[0]}/projection/base/regenerate?userId=${viewerId}`,
        viewerId,
        {},
      )
    ).status;
  }

  const firstFile = path.resolve(
    process.cwd(),
    "..",
    "gerador de testes",
    "zelo-financial-fixture-generator",
    "output",
    "seed-v1",
    "statements",
    "company-001",
    "2025-01-itau.xlsx",
  );
  const form = new FormData();
  form.append("file", new Blob([await readFile(firstFile)]), path.basename(firstFile));
  const adminImport = await fetch(
    `${baseUrl}/api/companies/${companyIds[0]}/bank-accounts/published-account-company-001-001/imports`,
    { method: "POST", headers: { "x-user-id": adminId }, body: form },
  );

  console.log(
    JSON.stringify(
      {
        pendingByType,
        pendingItemsByStatus,
        suggestionsByBand,
        categorizedByCompany,
        categorizedByCategory,
        transactionSignals,
        recurrencesByPattern,
        recurrenceSuggestionsByStatus,
        distinctRecurrenceKeys,
        projection,
        viewerProjectionStatus,
        adminImportStatus: adminImport.status,
        adminReimport: await adminImport.json(),
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
  .finally(async () => prisma.$disconnect());
