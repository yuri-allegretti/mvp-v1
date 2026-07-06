import type { ImportSource, Prisma, Transaction as PrismaTransaction } from "@prisma/client";
import type {
  Transaction as RecurrenceInput,
  TransactionSource,
} from "../core/types.ts";

export interface RecurrenceAdapterEvidence {
  adapterVersion: "transaction-to-recurrence-input-v1";
  sourceMapping: Record<string, TransactionSource>;
  originalSourcesByTransactionId: Record<string, ImportSource>;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function sourceForDetector(source: ImportSource): TransactionSource {
  if (source === "csv") return "csv";
  return "csv";
}

export function transactionToRecurrenceInput(
  transaction: PrismaTransaction,
): RecurrenceInput {
  return {
    id: transaction.id,
    companyId: transaction.companyId,
    bankAccountId: transaction.bankAccountId,
    date: dateOnly(transaction.date),
    amount: (transaction.amount as Prisma.Decimal).toNumber(),
    type: transaction.type,
    description: transaction.description,
    ...(transaction.categoryId ? { categoryId: transaction.categoryId } : {}),
    ...(transaction.counterpartyName ? { counterpartyName: transaction.counterpartyName } : {}),
    ...(transaction.documentNumber ? { documentNumber: transaction.documentNumber } : {}),
    externalId: transaction.externalId,
    source: sourceForDetector(transaction.source),
  };
}

export function buildRecurrenceAdapterEvidence(
  transactions: PrismaTransaction[],
): RecurrenceAdapterEvidence {
  const originalSourcesByTransactionId: Record<string, ImportSource> = {};
  const sourceMapping: Record<string, TransactionSource> = {};

  for (const transaction of transactions) {
    originalSourcesByTransactionId[transaction.id] = transaction.source;
    sourceMapping[transaction.source] = sourceForDetector(transaction.source);
  }

  return {
    adapterVersion: "transaction-to-recurrence-input-v1",
    sourceMapping,
    originalSourcesByTransactionId,
  };
}
