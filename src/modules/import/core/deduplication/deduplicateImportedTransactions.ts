import type { ImportedBankTransaction } from "../types";
import { buildExternalIdBaseKey } from "./generateExternalId";

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
    const identityKey = buildExternalIdBaseKey({
      companyId: transaction.companyId,
      bankAccountId: transaction.bankAccountId,
      date: transaction.date,
      amount: transaction.amount,
      description: transaction.description,
      ...(transaction.documentNumber
        ? { documentNumber: transaction.documentNumber }
        : {}),
    });
    if (seen.has(identityKey)) {
      duplicates.push(transaction);
      continue;
    }
    seen.add(identityKey);
    unique.push(transaction);
  }

  return { transactions: unique, duplicates };
}
