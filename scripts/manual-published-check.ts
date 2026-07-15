import { readFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.auditEvent.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.pendingItem.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.projectedCashflowItem.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.approvedRecurrence.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.recurrenceSuggestionTransaction.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.recurrenceSuggestion.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.categorizationSuggestion.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.importedTransactionRaw.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.importIssue.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.bankImport.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.transaction.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.uploadedFile.deleteMany({ where: { companyId: "demo-company" } });

  const base = "http://127.0.0.1:3000";
  const userId = "demo-accountant";
  const viewerId = "demo-viewer";
  const pageUrls = [
    "/dashboard?userId=demo-accountant",
    "/import?userId=demo-accountant",
    "/transactions?userId=demo-accountant",
    "/categorization?userId=demo-accountant",
    "/pending?userId=demo-accountant",
    "/recurrences?userId=demo-accountant",
    "/projection?userId=demo-accountant",
    "/recurrences?userId=demo-viewer",
  ];

  const pageStatuses = [];
  for (const pageUrl of pageUrls) {
    const response = await fetch(`${base}${pageUrl}`);
    pageStatuses.push({ pageUrl, status: response.status });
  }

  const buffer = await readFile(
    "tests/fixtures/import/Extrato Conta Corrente-200620262150.xls",
  );
  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: "application/vnd.ms-excel" }),
    "Extrato Conta Corrente-200620262150.xls",
  );

  const importResponse = await fetch(
    `${base}/api/companies/demo-company/bank-accounts/demo-itau-account/imports`,
    {
      method: "POST",
      headers: { "x-user-id": userId },
      body: form,
    },
  );
  const importPayload = await importResponse.json();

  const categorizationSuggestionsResponse = await fetch(
    `${base}/api/companies/demo-company/categorization/suggestions?pending=true`,
    {
      headers: { "x-user-id": userId },
    },
  );
  const categorizationSuggestions = await categorizationSuggestionsResponse.json();

  const pendingResponse = await fetch(
    `${base}/api/companies/demo-company/pending?userId=demo-accountant`,
    {
      headers: { "x-user-id": userId },
    },
  );
  const pendingItems = await pendingResponse.json();

  const recurrenceSuggestionsResponse = await fetch(
    `${base}/api/companies/demo-company/recurrences/suggestions?userId=demo-accountant`,
    {
      headers: { "x-user-id": userId },
    },
  );
  const recurrenceSuggestions = await recurrenceSuggestionsResponse.json();

  const firstCategorizationSuggestion = categorizationSuggestions[0] ?? null;
  let acceptedCategoryId: string | null = null;
  let acceptedPendingStatus: string | null = null;

  if (firstCategorizationSuggestion) {
    const acceptResponse = await fetch(
      `${base}/api/companies/demo-company/categorization/suggestions/${firstCategorizationSuggestion.id}/accept`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          reason: "Aceite manual via validação publicada",
        }),
      },
    );

    if (!acceptResponse.ok) {
      throw new Error(
        `Failed to accept categorization suggestion: ${acceptResponse.status} ${await acceptResponse.text()}`,
      );
    }

    const transactionsResponse = await fetch(
      `${base}/api/companies/demo-company/transactions?userId=demo-accountant`,
      {
        headers: { "x-user-id": userId },
      },
    );
    const transactions = await transactionsResponse.json();
    const acceptedTransaction = transactions.find(
      (item: { id: string }) => item.id === firstCategorizationSuggestion.transactionId,
    );

    acceptedCategoryId =
      acceptedTransaction?.category?.id ?? acceptedTransaction?.categoryId ?? null;

    const refreshedSuggestionsResponse = await fetch(
      `${base}/api/companies/demo-company/categorization/suggestions?transactionId=${firstCategorizationSuggestion.transactionId}`,
      {
        headers: { "x-user-id": userId },
      },
    );
    const refreshedSuggestions = await refreshedSuggestionsResponse.json();
    const refreshedSuggestion = refreshedSuggestions.find(
      (item: { id: string }) => item.id === firstCategorizationSuggestion.id,
    );

    acceptedPendingStatus =
      refreshedSuggestion?.pendingItems?.[0]?.status ?? "resolved_or_dismissed";
  }

  const firstRecurrenceSuggestion =
    recurrenceSuggestions.find(
      (item: { status: string }) => item.status === "pending" || item.status === "edited",
    ) ?? null;

  let approvedRecurrence:
    | { id: string; status: string; nextDate: string | null }
    | null = null;
  let projectionCounts:
    | { days30: number; days60: number; days90: number }
    | null = null;
  let viewerApproveStatus: number | null = null;
  let viewerProjectionStatus: number | null = null;

  if (firstRecurrenceSuggestion) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const nextDate = tomorrow.toISOString().slice(0, 10);

    const approveResponse = await fetch(
      `${base}/api/companies/demo-company/recurrences/${firstRecurrenceSuggestion.id}/approve?userId=demo-accountant`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          nextDate,
          endDate: null,
          installmentCount: null,
          reason: "Aprovação manual publicada com ajuste de próxima data",
        }),
      },
    );

    if (!approveResponse.ok) {
      throw new Error(
        `Failed to approve recurrence suggestion: ${approveResponse.status} ${await approveResponse.text()}`,
      );
    }

    const approvedPayload = await approveResponse.json();
    approvedRecurrence = {
      id: approvedPayload.id,
      status: approvedPayload.status,
      nextDate: approvedPayload.nextDate,
    };

    const projectionResponse = await fetch(
      `${base}/api/companies/demo-company/projection/base/regenerate?userId=demo-accountant`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: "{}",
      },
    );
    const projectionPayload = await projectionResponse.json();
    projectionCounts = {
      days30: projectionPayload.horizons["30"].length,
      days60: projectionPayload.horizons["60"].length,
      days90: projectionPayload.horizons["90"].length,
    };

    const viewerApproveResponse = await fetch(
      `${base}/api/companies/demo-company/recurrences/${firstRecurrenceSuggestion.id}/approve?userId=demo-viewer`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": viewerId,
        },
        body: JSON.stringify({
          nextDate,
          endDate: null,
          installmentCount: null,
        }),
      },
    );
    viewerApproveStatus = viewerApproveResponse.status;

    const viewerProjectionResponse = await fetch(
      `${base}/api/companies/demo-company/projection/base/regenerate?userId=demo-viewer`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": viewerId,
        },
        body: "{}",
      },
    );
    viewerProjectionStatus = viewerProjectionResponse.status;
  }

  console.log(
    JSON.stringify(
      {
        pageStatuses,
        importResponseStatus: importResponse.status,
        importSummary: {
          transactionsCreated: importPayload.transactionsCreated,
          duplicatesSkipped: importPayload.duplicatesSkipped,
          postProcessing: importPayload.postProcessing,
        },
        categorizationSuggestionCount: categorizationSuggestions.length,
        pendingCount: pendingItems.length,
        recurrenceSuggestionCount: recurrenceSuggestions.length,
        acceptedCategoryId,
        acceptedPendingStatus,
        approvedRecurrence,
        projectionCounts,
        viewerApproveStatus,
        viewerProjectionStatus,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
