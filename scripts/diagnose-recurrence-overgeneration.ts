import type { Prisma, RecurrenceSuggestion, Transaction } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { transactionToRecurrenceInput } from "../src/modules/recurrences/adapters/transactionToRecurrenceInput";
import { detectRecurrences } from "../src/modules/recurrences/core/service/recurrenceDetectionService.ts";
import { detectRecurrenceSuggestionsForCompany } from "../src/modules/recurrences/services/recurrenceDetectionWorkflow";
import { consolidateCoreRecurrenceSuggestions } from "../src/modules/recurrences/services/recurrenceSuggestionConsolidation";

const publishedCompanyIds = [1, 2, 3, 4, 5].map(
  (number) => `published-company-${String(number).padStart(3, "0")}`,
);

interface SuggestionRow extends RecurrenceSuggestion {
  transactions: Array<{
    transactionId: string;
    transaction: Pick<Transaction, "bankAccountId">;
  }>;
}

function decimal(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function date(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function countBy(values: Array<string | null>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const key = value ?? "<null>";
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort((left, right) => right[1] - left[1]));
}

function bankAccountKey(suggestion: SuggestionRow): string {
  return [...new Set(suggestion.transactions.map((item) => item.transaction.bankAccountId))]
    .sort()
    .join(",");
}

function apparentEconomicKey(suggestion: SuggestionRow): string {
  return [
    suggestion.companyId,
    bankAccountKey(suggestion),
    suggestion.type,
    suggestion.frequency,
    suggestion.recurrenceType,
    suggestion.patternKind ?? "legacy",
    suggestion.categoryId ?? "uncategorized",
    suggestion.normalizedDescription,
  ].join("|");
}

function detailedSuggestion(suggestion: SuggestionRow): Record<string, unknown> {
  return {
    id: suggestion.id,
    companyId: suggestion.companyId,
    bankAccountId: bankAccountKey(suggestion),
    type: suggestion.type,
    frequency: suggestion.frequency,
    recurrenceType: suggestion.recurrenceType,
    patternKind: suggestion.patternKind,
    categoryId: suggestion.categoryId,
    normalizedDescription: suggestion.normalizedDescription,
    representativeDescription: suggestion.representativeDescription,
    averageAmount: decimal(suggestion.averageAmount),
    estimatedNextAmount: decimal(suggestion.estimatedNextAmount),
    expectedNextDate: date(suggestion.expectedNextDate),
    startDate: date(suggestion.startDate),
    endDate: date(suggestion.endDate),
    confidenceScore: suggestion.confidenceScore,
    transactionCount: suggestion.transactions.length,
    transactionIds: suggestion.transactions.map((item) => item.transactionId).sort(),
    deduplicationKey: suggestion.deduplicationKey,
    createdAt: suggestion.createdAt.toISOString(),
  };
}

function overlapDiagnostics(suggestions: SuggestionRow[]): {
  pairsWithOverlap: number;
  pairsOver70Percent: number;
  top50: Array<Record<string, unknown>>;
} {
  const suggestionById = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));
  const suggestionIdsByTransaction = new Map<string, string[]>();
  for (const suggestion of suggestions) {
    for (const relation of suggestion.transactions) {
      const ids = suggestionIdsByTransaction.get(relation.transactionId) ?? [];
      ids.push(suggestion.id);
      suggestionIdsByTransaction.set(relation.transactionId, ids);
    }
  }

  const intersections = new Map<string, number>();
  for (const suggestionIds of suggestionIdsByTransaction.values()) {
    const uniqueIds = [...new Set(suggestionIds)].sort();
    for (let left = 0; left < uniqueIds.length; left += 1) {
      for (let right = left + 1; right < uniqueIds.length; right += 1) {
        const key = `${uniqueIds[left]}|${uniqueIds[right]}`;
        intersections.set(key, (intersections.get(key) ?? 0) + 1);
      }
    }
  }

  let pairsOver70Percent = 0;
  const rows = [...intersections.entries()].map(([key, intersection]) => {
    const [leftId, rightId] = key.split("|") as [string, string];
    const left = suggestionById.get(leftId)!;
    const right = suggestionById.get(rightId)!;
    const union = left.transactions.length + right.transactions.length - intersection;
    const jaccard = union === 0 ? 0 : intersection / union;
    const overlapCoefficient = intersection / Math.min(left.transactions.length, right.transactions.length);
    if (overlapCoefficient > 0.7) pairsOver70Percent += 1;
    return {
      leftId,
      rightId,
      companyId: left.companyId,
      intersection,
      leftCount: left.transactions.length,
      rightCount: right.transactions.length,
      jaccard: Number(jaccard.toFixed(4)),
      overlapCoefficient: Number(overlapCoefficient.toFixed(4)),
      sameApparentEconomicKey: apparentEconomicKey(left) === apparentEconomicKey(right),
    };
  });

  rows.sort((left, right) =>
    right.overlapCoefficient - left.overlapCoefficient || right.intersection - left.intersection,
  );
  return {
    pairsWithOverlap: rows.length,
    pairsOver70Percent,
    top50: rows.slice(0, 50),
  };
}

async function creationByImport(companyId: string, suggestions: SuggestionRow[]): Promise<Array<Record<string, unknown>>> {
  const imports = await prisma.bankImport.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: { id: true, originalFileName: true, createdAt: true },
  });
  const counts = new Map<string, number>();
  for (const suggestion of suggestions) {
    const closest = [...imports]
      .reverse()
      .find((bankImport) => bankImport.createdAt.getTime() <= suggestion.createdAt.getTime());
    const key = closest ? `${closest.id}|${closest.originalFileName}` : "<unattributed>";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [bankImportId, originalFileName] = key.split("|");
      return { bankImportId, originalFileName, suggestionsCreated: count };
    })
    .sort((left, right) => Number(right.suggestionsCreated) - Number(left.suggestionsCreated));
}

async function diagnoseCompany(companyId: string, rerun: boolean): Promise<Record<string, unknown>> {
  const [transactions, suggestions, recurrencePending] = await Promise.all([
    prisma.transaction.findMany({ where: { companyId }, orderBy: [{ date: "asc" }, { id: "asc" }] }),
    prisma.recurrenceSuggestion.findMany({
      where: { companyId },
      include: {
        transactions: {
          select: {
            transactionId: true,
            transaction: { select: { bankAccountId: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pendingItem.findMany({
      where: { companyId, type: "recurrence_approval", status: { in: ["open", "in_review"] } },
      select: { id: true, recurrenceSuggestionId: true },
    }),
  ]);

  const raw = detectRecurrences(transactions.map(transactionToRecurrenceInput));
  const transactionIdentities = new Map(
    transactions.map((transaction) => [transaction.id, transaction]),
  );
  const consolidatedRaw = consolidateCoreRecurrenceSuggestions(raw, transactionIdentities);
  const openPendingBySuggestion = new Map<string, string[]>();
  for (const pending of recurrencePending) {
    if (!pending.recurrenceSuggestionId) continue;
    openPendingBySuggestion.set(pending.recurrenceSuggestionId, [
      ...(openPendingBySuggestion.get(pending.recurrenceSuggestionId) ?? []),
      pending.id,
    ]);
  }
  const actionableSuggestions = suggestions.filter(
    (item) => item.status === "pending" || item.status === "edited",
  );
  const pendingIntegrity = {
    actionableWithoutOpenPending: actionableSuggestions
      .filter((suggestion) => !openPendingBySuggestion.has(suggestion.id))
      .map((suggestion) => suggestion.id),
    nonActionableWithOpenPending: suggestions
      .filter(
        (suggestion) =>
          suggestion.status !== "pending" &&
          suggestion.status !== "edited" &&
          openPendingBySuggestion.has(suggestion.id),
      )
      .map((suggestion) => suggestion.id),
    suggestionsWithMultipleOpenPending: [...openPendingBySuggestion.entries()]
      .filter(([, pendingIds]) => pendingIds.length > 1)
      .map(([suggestionId, pendingIds]) => ({ suggestionId, pendingIds })),
  };
  const apparentGroups = new Map<string, SuggestionRow[]>();
  for (const suggestion of suggestions) {
    const key = apparentEconomicKey(suggestion);
    apparentGroups.set(key, [...(apparentGroups.get(key) ?? []), suggestion]);
  }
  const similarGroups = [...apparentGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      suggestionCount: rows.length,
      suggestions: rows.map(detailedSuggestion),
    }))
    .sort((left, right) => right.suggestionCount - left.suggestionCount);

  const overlap = overlapDiagnostics(suggestions);
  const beforeRerun = suggestions.length;
  const rerunResult = rerun
    ? await detectRecurrenceSuggestionsForCompany({ companyId }, prisma)
    : null;
  const afterRerunSuggestions = rerun
    ? await prisma.recurrenceSuggestion.findMany({
        where: { companyId },
        select: { id: true, status: true },
      })
    : suggestions.map((suggestion) => ({ id: suggestion.id, status: suggestion.status }));
  const afterRerun = afterRerunSuggestions.length;
  const beforeActionableIds = new Set(actionableSuggestions.map((suggestion) => suggestion.id));
  const afterActionableIds = new Set(
    afterRerunSuggestions
      .filter((suggestion) => suggestion.status === "pending" || suggestion.status === "edited")
      .map((suggestion) => suggestion.id),
  );

  return {
    companyId,
    totals: {
      transactions: transactions.length,
      detectorRawOnce: raw.length,
      detectorRawConsolidated: consolidatedRaw.length,
      persistedSuggestions: suggestions.length,
      actionableSuggestions: actionableSuggestions.length,
      supersededSuggestions: suggestions.filter((item) => item.status === "superseded").length,
      approvedSuggestions: suggestions.filter((item) => item.status === "approved").length,
      recurrenceApprovalPending: recurrencePending.length,
      apparentEconomicGroups: apparentGroups.size,
    },
    dimensions: {
      bankAccountId: countBy(suggestions.map(bankAccountKey)),
      status: countBy(suggestions.map((item) => item.status)),
      type: countBy(suggestions.map((item) => item.type)),
      frequency: countBy(suggestions.map((item) => item.frequency)),
      recurrenceType: countBy(suggestions.map((item) => item.recurrenceType)),
      patternKind: countBy(suggestions.map((item) => item.patternKind)),
      categoryId: countBy(suggestions.map((item) => item.categoryId)),
      normalizedDescription: countBy(suggestions.map((item) => item.normalizedDescription)),
      representativeDescription: countBy(suggestions.map((item) => item.representativeDescription)),
      averageAmount: countBy(suggestions.map((item) => decimal(item.averageAmount))),
      estimatedNextAmount: countBy(suggestions.map((item) => decimal(item.estimatedNextAmount))),
      expectedNextDate: countBy(suggestions.map((item) => date(item.expectedNextDate))),
      startDate: countBy(suggestions.map((item) => date(item.startDate))),
      endDate: countBy(suggestions.map((item) => date(item.endDate))),
      transactionCount: countBy(suggestions.map((item) => String(item.transactions.length))),
    },
    rawConsolidatedSuggestions: consolidatedRaw.map((suggestion) => ({
      id: suggestion.id,
      type: suggestion.type,
      frequency: suggestion.frequency,
      recurrenceType: suggestion.recurrenceType,
      patternKind: suggestion.patternKind ?? null,
      categoryId: suggestion.categoryId ?? null,
      normalizedDescription: suggestion.normalizedDescription,
      representativeDescription: suggestion.representativeDescription,
      averageAmount: suggestion.averageAmount,
      estimatedNextAmount: suggestion.estimatedNextAmount,
      expectedNextDate: suggestion.expectedNextDate ?? null,
      startDate: suggestion.startDate,
      endDate: suggestion.endDate ?? null,
      transactionCount: suggestion.transactionIds.length,
      transactionIds: suggestion.transactionIds,
    })),
    top50SimilarGroups: similarGroups.slice(0, 50),
    top50NormalizedDescriptions: Object.entries(
      countBy(suggestions.map((item) => item.normalizedDescription)),
    )
      .slice(0, 50)
      .map(([normalizedDescription, count]) => ({ normalizedDescription, count })),
    overlap,
    pendingIntegrity,
    pendingSameApparentEconomicGroup: similarGroups.reduce(
      (total, group) => total + group.suggestionCount - 1,
      0,
    ),
    suggestionsAttributedToImport: await creationByImport(companyId, suggestions),
    rerun: rerunResult
      ? {
          detectorRaw: rerunResult.detectedSuggestions,
          suggestionsCreated: rerunResult.suggestionsCreated,
          pendingCreated: rerunResult.pendingCreated,
          persistedBefore: beforeRerun,
          persistedAfter: afterRerun,
          activatedSuggestionIds: [...afterActionableIds].filter((id) => !beforeActionableIds.has(id)),
          supersededSuggestionIds: [...beforeActionableIds].filter((id) => !afterActionableIds.has(id)),
        }
      : null,
  };
}

async function main(): Promise<void> {
  const rerun = process.argv.includes("--rerun");
  const summaryOnly = process.argv.includes("--summary");
  const compact = process.argv.includes("--compact");
  const requestedCompany = process.argv.find((argument) => argument.startsWith("--company="))?.split("=")[1];
  const companyIds = requestedCompany ? [requestedCompany] : publishedCompanyIds;
  const companies = [];
  for (const companyId of companyIds) {
    companies.push(await diagnoseCompany(companyId, rerun));
  }
  const outputCompanies = summaryOnly
    ? companies.map((company) => ({
        companyId: company.companyId,
        totals: company.totals,
        overlap: {
          pairsWithOverlap: (company.overlap as Record<string, unknown>).pairsWithOverlap,
          pairsOver70Percent: (company.overlap as Record<string, unknown>).pairsOver70Percent,
        },
        pendingSameApparentEconomicGroup: company.pendingSameApparentEconomicGroup,
        pendingIntegrity: company.pendingIntegrity,
        ...(compact ? {} : { rawConsolidatedSuggestions: company.rawConsolidatedSuggestions }),
        ...(compact ? {} : { suggestionsAttributedToImport: company.suggestionsAttributedToImport }),
        rerun: company.rerun,
      }))
    : companies;
  console.log(
    JSON.stringify({ generatedAt: new Date().toISOString(), rerun, summaryOnly, compact, companies: outputCompanies }, null, 2),
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
