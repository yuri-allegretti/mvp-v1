import type { ImportVersions } from "./versions";

export type ImportSource = "itau_xls" | "itau_xlsx" | "itau_pdf";
export type DetectedFormat = "xls" | "xlsx" | "pdf" | "unknown";

export interface ImportedBankTransaction {
  id?: string;
  companyId: string;
  bankAccountId: string;
  source: ImportSource;
  sourceFileId: string;
  sourceRowNumber?: number;

  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  balanceAfter?: number;

  externalId: string;
  counterpartyName?: string;
  documentNumber?: string;

  rawData?: Record<string, unknown>;
}

export interface ImportIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  rowNumber?: number;
  rawValue?: unknown;
}

export interface ImportReport {
  importId: string;
  detectedBank: "itau" | "unknown";
  detectedFormat: DetectedFormat;
  detectedLayout?: "itau-layout-v1" | "itau-layout-unknown";
  fileName: string;

  periodStart?: string;
  periodEnd?: string;

  accountInfo?: {
    agency?: string;
    accountNumber?: string;
    holderName?: string;
  };

  totalRows: number;
  parsedRows: number;
  ignoredRows: number;
  importedTransactions: number;
  duplicateTransactions: number;
  invalidRows: number;

  versions: ImportVersions;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export interface ImportBankStatementParams {
  filePath: string;
  companyId: string;
  bankAccountId: string;
  sourceFileId: string;
  originalFileName?: string;
  maxFileSizeBytes?: number;
}

export interface ImportBankStatementResult {
  transactions: ImportedBankTransaction[];
  report: ImportReport;
}
