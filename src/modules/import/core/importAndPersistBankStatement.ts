import { importBankStatement } from "./importBankStatement";
import { persistImportResult } from "./persistence/persistImportResult";
import type { ImportPersistenceStore } from "./persistence/types";
import { prismaImportPersistenceStore } from "./persistence/prismaImportPersistenceStore";
import type { ImportBankStatementParams, ImportReport } from "./types";

export interface ImportAndPersistBankStatementResult {
  bankImportId: string;
  transactionsCreated: number;
  duplicatesSkipped: number;
  invalidRows: number;
  report: ImportReport;
}

export async function importAndPersistBankStatement(
  params: ImportBankStatementParams,
  store: ImportPersistenceStore = prismaImportPersistenceStore,
): Promise<ImportAndPersistBankStatementResult> {
  const imported = await importBankStatement(params);
  const persisted = await persistImportResult(
    {
      companyId: params.companyId,
      bankAccountId: params.bankAccountId,
      sourceFileId: params.sourceFileId,
      ...(params.originalFileName !== undefined
        ? { originalFileName: params.originalFileName }
        : {}),
      transactions: imported.transactions,
      report: imported.report,
    },
    store,
  );
  return {
    bankImportId: persisted.bankImportId,
    transactionsCreated: persisted.transactionsCreated,
    duplicatesSkipped: persisted.duplicatesSkipped,
    invalidRows: persisted.invalidRows,
    report: persisted.report,
  };
}
