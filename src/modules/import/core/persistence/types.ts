import type { ImportedBankTransaction, ImportIssue, ImportReport } from "../types";

export type PersistedBankImportStatus = "success" | "partial_success" | "failed";
export type PersistedRawStatus = "imported" | "duplicate" | "invalid" | "ignored";

export interface PersistedTransactionRecord {
  id: string;
  companyId: string;
  bankAccountId: string;
  date: Date;
  description: string;
  amount: number;
  type: "income" | "expense";
  source: "itau_xls" | "itau_xlsx" | "itau_pdf";
  sourceFileId: string;
  externalId: string;
  counterpartyName?: string;
  documentNumber?: string;
}

export interface CreateBankImportData {
  companyId: string;
  bankAccountId: string;
  sourceFileId: string;
  originalFileName: string;
  detectedBank: string;
  detectedFormat: string;
  parserVersion: string;
  layoutVersion: string;
  externalIdVersion: string;
  importPipelineVersion: string;
  periodStart?: Date;
  periodEnd?: Date;
  totalRows: number;
  parsedRows: number;
  ignoredRows: number;
  importedTransactions: number;
  duplicateTransactions: number;
  invalidRows: number;
  status: PersistedBankImportStatus;
}

export interface UpdateBankImportData {
  importedTransactions: number;
  duplicateTransactions: number;
  invalidRows: number;
  status: PersistedBankImportStatus;
}

export interface CreateRawTransactionData {
  bankImportId: string;
  transactionId?: string;
  transaction: ImportedBankTransaction;
  status: PersistedRawStatus;
}

export interface ImportPersistenceTransaction {
  bankAccountBelongsToCompany(companyId: string, bankAccountId: string): Promise<boolean>;
  createBankImport(data: CreateBankImportData): Promise<{ id: string }>;
  createImportIssues(bankImportId: string, issues: ImportIssue[]): Promise<void>;
  createTransactionIfAbsent(
    transaction: ImportedBankTransaction,
  ): Promise<{ created: boolean; transaction: PersistedTransactionRecord }>;
  createRawTransaction(data: CreateRawTransactionData): Promise<void>;
  updateBankImport(id: string, data: UpdateBankImportData): Promise<void>;
}

export interface ImportPersistenceStore {
  transaction<T>(
    callback: (transaction: ImportPersistenceTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface PersistImportResultParams {
  companyId: string;
  bankAccountId: string;
  sourceFileId: string;
  originalFileName?: string;
  transactions: ImportedBankTransaction[];
  report: ImportReport;
}

export interface PersistImportSummary {
  bankImportId: string;
  transactionsCreated: number;
  duplicatesSkipped: number;
  invalidRows: number;
  report: ImportReport;
  persistedTransactions: PersistedTransactionRecord[];
}
