import type { PendingStatus, PrismaClient } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { PendingTypes } from "../../categorization/domain/models";
import { categorizeTransactions } from "../../categorization/services/categorization-workflow";
import { detectPossibleDuplicates } from "../../duplicates";
import { detectRecurrenceSuggestionsForCompany } from "../../recurrences";

const actionablePendingStatuses: PendingStatus[] = ["open", "in_review"];
const categorizationPendingTypes = Object.values(PendingTypes);

export interface RunPostImportProcessingInput {
  companyId: string;
  bankAccountId: string;
  actorUserId: string;
  bankImportId: string;
  transactionIds?: string[];
}

export interface PostImportProcessingSummary {
  processedTransactionIds: string[];
  categorizedTransactions: number;
  categorizationSuggestions: number;
  pendingItemsCreated: number;
  duplicateCandidatesCreated: number;
  recurrenceSuggestionsCreated: number;
  recurrenceApprovalPendingsCreated: number;
}

async function resolveRelevantTransactionIds(
  input: RunPostImportProcessingInput,
  client: PrismaClient,
): Promise<string[]> {
  if (input.transactionIds && input.transactionIds.length > 0) {
    return [...new Set(input.transactionIds)];
  }

  const rows = await client.importedTransactionRaw.findMany({
    where: {
      companyId: input.companyId,
      bankImportId: input.bankImportId,
      bankAccountId: input.bankAccountId,
      status: { in: ["imported", "duplicate"] },
      transactionId: { not: null },
    },
    select: { transactionId: true },
  });

  return [...new Set(rows.map((row) => row.transactionId).filter((value): value is string => value !== null))];
}

async function countCategorizationSuggestions(
  companyId: string,
  transactionIds: string[],
  client: PrismaClient,
): Promise<number> {
  if (transactionIds.length === 0) return 0;
  return client.categorizationSuggestion.count({
    where: {
      companyId,
      transactionId: { in: transactionIds },
    },
  });
}

async function countCategorizedTransactions(
  companyId: string,
  transactionIds: string[],
  client: PrismaClient,
): Promise<number> {
  if (transactionIds.length === 0) return 0;
  return client.transaction.count({
    where: {
      companyId,
      id: { in: transactionIds },
      categoryId: { not: null },
    },
  });
}

async function countCategorizationPendings(
  companyId: string,
  transactionIds: string[],
  client: PrismaClient,
): Promise<number> {
  if (transactionIds.length === 0) return 0;
  return client.pendingItem.count({
    where: {
      companyId,
      transactionId: { in: transactionIds },
      type: { in: categorizationPendingTypes },
    },
  });
}

async function countRecurrenceApprovalPendings(
  companyId: string,
  client: PrismaClient,
): Promise<number> {
  return client.pendingItem.count({
    where: {
      companyId,
      type: "recurrence_approval",
      status: { in: actionablePendingStatuses },
    },
  });
}

export async function runPostImportProcessing(
  input: RunPostImportProcessingInput,
  client: PrismaClient = prisma,
): Promise<PostImportProcessingSummary> {
  const relevantTransactionIds = await resolveRelevantTransactionIds(input, client);

  const [
    beforeCategorizedTransactions,
    beforeCategorizationSuggestions,
    beforeCategorizationPendings,
    beforeRecurrenceApprovalPendings,
  ] = await Promise.all([
    countCategorizedTransactions(input.companyId, relevantTransactionIds, client),
    countCategorizationSuggestions(input.companyId, relevantTransactionIds, client),
    countCategorizationPendings(input.companyId, relevantTransactionIds, client),
    countRecurrenceApprovalPendings(input.companyId, client),
  ]);

  if (relevantTransactionIds.length > 0) {
    await categorizeTransactions(
      {
        companyId: input.companyId,
        transactionIds: relevantTransactionIds,
      },
      client,
    );
  }

  const duplicateResult = await detectPossibleDuplicates(
    {
      companyId: input.companyId,
      bankAccountId: input.bankAccountId,
    },
    client,
  );

  const recurrenceResult = await detectRecurrenceSuggestionsForCompany(
    {
      companyId: input.companyId,
    },
    client,
  );

  const [
    afterCategorizedTransactions,
    afterCategorizationSuggestions,
    afterCategorizationPendings,
    afterRecurrenceApprovalPendings,
  ] = await Promise.all([
    countCategorizedTransactions(input.companyId, relevantTransactionIds, client),
    countCategorizationSuggestions(input.companyId, relevantTransactionIds, client),
    countCategorizationPendings(input.companyId, relevantTransactionIds, client),
    countRecurrenceApprovalPendings(input.companyId, client),
  ]);

  return {
    processedTransactionIds: relevantTransactionIds,
    categorizedTransactions: Math.max(afterCategorizedTransactions - beforeCategorizedTransactions, 0),
    categorizationSuggestions: Math.max(
      afterCategorizationSuggestions - beforeCategorizationSuggestions,
      0,
    ),
    pendingItemsCreated:
      Math.max(afterCategorizationPendings - beforeCategorizationPendings, 0) +
      duplicateResult.pendingCreated,
    duplicateCandidatesCreated: duplicateResult.candidatesCreated,
    recurrenceSuggestionsCreated: recurrenceResult.suggestionsCreated,
    recurrenceApprovalPendingsCreated: Math.max(
      afterRecurrenceApprovalPendings - beforeRecurrenceApprovalPendings,
      recurrenceResult.pendingCreated,
      0,
    ),
  };
}
