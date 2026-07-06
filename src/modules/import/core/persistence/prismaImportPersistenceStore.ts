import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import type { ImportedBankTransaction, ImportIssue } from "../types";
import type {
  CreateBankImportData,
  CreateRawTransactionData,
  ImportPersistenceStore,
  ImportPersistenceTransaction,
  PersistedTransactionRecord,
  UpdateBankImportData,
} from "./types";

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapPersistedTransaction(transaction: {
  id: string;
  companyId: string;
  bankAccountId: string;
  date: Date;
  description: string;
  amount: Prisma.Decimal;
  type: "income" | "expense";
  source: string;
  sourceFileId: string;
  externalId: string;
  counterpartyName: string | null;
  documentNumber: string | null;
}): PersistedTransactionRecord {
  return {
    id: transaction.id,
    companyId: transaction.companyId,
    bankAccountId: transaction.bankAccountId,
    date: transaction.date,
    description: transaction.description,
    amount: transaction.amount.toNumber(),
    type: transaction.type,
    source: transaction.source as PersistedTransactionRecord["source"],
    sourceFileId: transaction.sourceFileId,
    externalId: transaction.externalId,
    ...(transaction.counterpartyName
      ? { counterpartyName: transaction.counterpartyName }
      : {}),
    ...(transaction.documentNumber ? { documentNumber: transaction.documentNumber } : {}),
  };
}

class PrismaImportPersistenceTransaction implements ImportPersistenceTransaction {
  constructor(private readonly client: Prisma.TransactionClient) {}

  async bankAccountBelongsToCompany(
    companyId: string,
    bankAccountId: string,
  ): Promise<boolean> {
    const account = await this.client.bankAccount.findFirst({
      where: { id: bankAccountId, companyId },
      select: { id: true },
    });
    return account !== null;
  }

  async createBankImport(data: CreateBankImportData): Promise<{ id: string }> {
    const uploadedFile = await this.client.uploadedFile.findFirst({
      where: {
        id: data.sourceFileId,
        companyId: data.companyId,
      },
      select: { id: true },
    });

    return this.client.bankImport.create({
      data: {
        ...data,
        ...(uploadedFile ? { uploadedFileId: uploadedFile.id } : {}),
      },
      select: { id: true },
    });
  }

  async createImportIssues(bankImportId: string, issues: ImportIssue[]): Promise<void> {
    if (issues.length === 0) return;

    const bankImport = await this.client.bankImport.findUniqueOrThrow({
      where: { id: bankImportId },
      select: { companyId: true },
    });

    await this.client.importIssue.createMany({
      data: issues.map((issue) => ({
        companyId: bankImport.companyId,
        bankImportId,
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        ...(issue.rowNumber !== undefined ? { rowNumber: issue.rowNumber } : {}),
        ...(issue.rawValue !== undefined ? { rawValue: toJsonValue(issue.rawValue) } : {}),
      })),
    });
  }

  async createTransactionIfAbsent(
    transaction: ImportedBankTransaction,
  ): Promise<{ created: boolean; transaction: PersistedTransactionRecord }> {
    const inserted = await this.client.transaction.createMany({
      data: {
        companyId: transaction.companyId,
        bankAccountId: transaction.bankAccountId,
        date: toDateOnly(transaction.date),
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        source: transaction.source,
        sourceFileId: transaction.sourceFileId,
        externalId: transaction.externalId,
        ...(transaction.counterpartyName
          ? { counterpartyName: transaction.counterpartyName }
          : {}),
        ...(transaction.documentNumber ? { documentNumber: transaction.documentNumber } : {}),
      },
      skipDuplicates: true,
    });

    const persisted = await this.client.transaction.findUniqueOrThrow({
      where: {
        transaction_external_identity: {
          companyId: transaction.companyId,
          bankAccountId: transaction.bankAccountId,
          externalId: transaction.externalId,
        },
      },
    });

    return {
      created: inserted.count === 1,
      transaction: mapPersistedTransaction(persisted),
    };
  }

  async createRawTransaction(data: CreateRawTransactionData): Promise<void> {
    const transaction = data.transaction;
    await this.client.importedTransactionRaw.create({
      data: {
        bankImportId: data.bankImportId,
        companyId: transaction.companyId,
        bankAccountId: transaction.bankAccountId,
        ...(data.transactionId ? { transactionId: data.transactionId } : {}),
        source: transaction.source,
        ...(transaction.sourceRowNumber !== undefined
          ? { sourceRowNumber: transaction.sourceRowNumber }
          : {}),
        date: toDateOnly(transaction.date),
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        ...(transaction.balanceAfter !== undefined
          ? { balanceAfter: transaction.balanceAfter }
          : {}),
        externalId: transaction.externalId,
        ...(transaction.counterpartyName
          ? { counterpartyName: transaction.counterpartyName }
          : {}),
        ...(transaction.documentNumber ? { documentNumber: transaction.documentNumber } : {}),
        rawData: toJsonValue(transaction.rawData ?? {}),
        status: data.status,
      },
    });
  }

  async updateBankImport(id: string, data: UpdateBankImportData): Promise<void> {
    await this.client.bankImport.update({ where: { id }, data });
  }
}

export class PrismaImportPersistenceStore implements ImportPersistenceStore {
  constructor(private readonly client: PrismaClient = prisma) {}

  transaction<T>(
    callback: (transaction: ImportPersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction((transaction) =>
      callback(new PrismaImportPersistenceTransaction(transaction)),
    );
  }
}

export const prismaImportPersistenceStore = new PrismaImportPersistenceStore();
