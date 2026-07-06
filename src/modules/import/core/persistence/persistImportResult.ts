import { ImportFileError } from "../errors";
import type { ImportIssue, ImportReport } from "../types";
import { prismaImportPersistenceStore } from "./prismaImportPersistenceStore";
import type {
  ImportPersistenceStore,
  PersistedBankImportStatus,
  PersistImportResultParams,
  PersistImportSummary,
} from "./types";

function toOptionalDate(value: string | undefined): Date | undefined {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function determineStatus(params: {
  report: ImportReport;
  transactionsCreated: number;
  duplicatesSkipped: number;
}): PersistedBankImportStatus {
  if (params.report.errors.length === 0) return "success";
  return params.transactionsCreated > 0 || params.duplicatesSkipped > 0
    ? "partial_success"
    : "failed";
}

function allIssues(report: ImportReport): ImportIssue[] {
  return [...report.errors, ...report.warnings];
}

export async function persistImportResult(
  params: PersistImportResultParams,
  store: ImportPersistenceStore = prismaImportPersistenceStore,
): Promise<PersistImportSummary> {
  return store.transaction(async (transaction) => {
    const validContext = await transaction.bankAccountBelongsToCompany(
      params.companyId,
      params.bankAccountId,
    );
    if (!validContext) {
      throw new ImportFileError(
        "BANK_ACCOUNT_NOT_FOUND",
        "A conta bancária não pertence à empresa informada.",
      );
    }

    const initialStatus = determineStatus({
      report: params.report,
      transactionsCreated: params.transactions.length,
      duplicatesSkipped: params.report.duplicateTransactions,
    });
    const periodStart = toOptionalDate(params.report.periodStart);
    const periodEnd = toOptionalDate(params.report.periodEnd);
    const bankImport = await transaction.createBankImport({
      companyId: params.companyId,
      bankAccountId: params.bankAccountId,
      sourceFileId: params.sourceFileId,
      originalFileName: params.report.fileName,
      detectedBank: params.report.detectedBank,
      detectedFormat: params.report.detectedFormat,
      parserVersion: params.report.versions.parserVersion,
      layoutVersion: params.report.versions.layoutVersion,
      externalIdVersion: params.report.versions.externalIdVersion,
      importPipelineVersion: params.report.versions.importPipelineVersion,
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
      totalRows: params.report.totalRows,
      parsedRows: params.report.parsedRows,
      ignoredRows: params.report.ignoredRows,
      importedTransactions: 0,
      duplicateTransactions: params.report.duplicateTransactions,
      invalidRows: params.report.invalidRows,
      status: initialStatus,
    });

    await transaction.createImportIssues(bankImport.id, allIssues(params.report));

    let transactionsCreated = 0;
    let databaseDuplicates = 0;
    const persistedTransactions = [];

    for (const importedTransaction of params.transactions) {
      const persisted = await transaction.createTransactionIfAbsent(importedTransaction);
      if (persisted.created) transactionsCreated += 1;
      else databaseDuplicates += 1;
      persistedTransactions.push(persisted.transaction);

      await transaction.createRawTransaction({
        bankImportId: bankImport.id,
        transactionId: persisted.transaction.id,
        transaction: importedTransaction,
        status: persisted.created ? "imported" : "duplicate",
      });
    }

    const duplicatesSkipped = params.report.duplicateTransactions + databaseDuplicates;
    const finalStatus = determineStatus({
      report: params.report,
      transactionsCreated,
      duplicatesSkipped,
    });
    await transaction.updateBankImport(bankImport.id, {
      importedTransactions: transactionsCreated,
      duplicateTransactions: duplicatesSkipped,
      invalidRows: params.report.invalidRows,
      status: finalStatus,
    });

    const persistedReport: ImportReport = {
      ...params.report,
      importId: bankImport.id,
      importedTransactions: transactionsCreated,
      duplicateTransactions: duplicatesSkipped,
    };

    return {
      bankImportId: bankImport.id,
      transactionsCreated,
      duplicatesSkipped,
      invalidRows: params.report.invalidRows,
      report: persistedReport,
      persistedTransactions,
    };
  });
}
