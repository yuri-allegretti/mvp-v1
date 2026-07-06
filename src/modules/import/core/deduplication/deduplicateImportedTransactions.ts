import type { ImportedBankTransaction } from "../types";

export interface DeduplicationResult {
  transactions: ImportedBankTransaction[];
  duplicates: ImportedBankTransaction[];
}

export function deduplicateImportedTransactions(
  transactions: ImportedBankTransaction[],
): DeduplicationResult {
  const seen = new Set<string>();
  const unique: ImportedBankTransaction[] = [];
  const duplicates: ImportedBankTransaction[] = [];

  for (const transaction of transactions) {
    if (seen.has(transaction.externalId)) {
      duplicates.push(transaction);
      continue;
    }
    seen.add(transaction.externalId);
    unique.push(transaction);
  }

  return { transactions: unique, duplicates };
}
