import { compareTransactionsText } from "../similarity/textSimilarity.ts";
import type { NormalizedTransaction } from "../types.ts";

export function removeDuplicateTransactions(transactions: NormalizedTransaction[]): NormalizedTransaction[] {
  const result: NormalizedTransaction[] = [];
  const externalIds = new Set<string>();
  const exactKeys = new Set<string>();

  for (const transaction of transactions) {
    const externalKey = buildExternalKey(transaction);
    if (externalKey) {
      if (externalIds.has(externalKey)) {
        continue;
      }
      externalIds.add(externalKey);
    }

    const exactKey = buildExactKey(transaction);
    if (exactKeys.has(exactKey)) {
      continue;
    }

    const likelyDuplicate = result.some((candidate) => {
      if (candidate.companyId !== transaction.companyId) return false;
      if ((candidate.bankAccountId ?? "") !== (transaction.bankAccountId ?? "")) return false;
      if (candidate.date !== transaction.date) return false;
      if (toCents(candidate.amount) !== toCents(transaction.amount)) return false;

      return compareTransactionsText(candidate, transaction).score >= 0.9;
    });

    if (likelyDuplicate) {
      continue;
    }

    exactKeys.add(exactKey);
    result.push(transaction);
  }

  return result;
}

function buildExternalKey(transaction: NormalizedTransaction): string | undefined {
  if (!transaction.externalId) {
    return undefined;
  }

  return [
    transaction.companyId,
    transaction.bankAccountId ?? "",
    transaction.source ?? "",
    transaction.externalId
  ].join("|");
}

function buildExactKey(transaction: NormalizedTransaction): string {
  return [
    transaction.companyId,
    transaction.bankAccountId ?? "",
    transaction.date,
    toCents(transaction.amount),
    transaction.normalizedDescription
  ].join("|");
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}
