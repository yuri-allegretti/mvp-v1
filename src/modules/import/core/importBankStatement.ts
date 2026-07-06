import path from "node:path";
import { deduplicateImportedTransactions } from "./deduplication/deduplicateImportedTransactions";
import {
  buildExternalIdBaseKey,
  generateExternalId,
  generateRowFingerprint,
} from "./deduplication/generateExternalId";
import { ImportFileError } from "./errors";
import { extractItauCounterparty } from "./itau/itauCounterpartyExtractor";
import { normalizeImportedDate } from "./normalization/normalizeImportedDate";
import { normalizeImportedDescription } from "./normalization/normalizeImportedDescription";
import { normalizeImportedValue } from "./normalization/normalizeImportedValue";
import { parseItauPdf } from "./parsers/itauPdfParser";
import type { ParsedStatement, ParsedStatementLine } from "./parsers/types";
import { parseItauSpreadsheet } from "./parsers/itauXlsxParser";
import {
  sanitizeOriginalFileName,
  validateImportFile,
} from "./security/validateImportFile";
import type {
  ImportBankStatementParams,
  ImportBankStatementResult,
  ImportedBankTransaction,
  ImportIssue,
  ImportReport,
  ImportSource,
} from "./types";
import { validateImportedTransaction } from "./validation/validateImportedTransaction";
import { IMPORT_VERSIONS } from "./versions";

function createInitialReport(params: ImportBankStatementParams): ImportReport {
  return {
    importId: params.sourceFileId,
    detectedBank: "unknown",
    detectedFormat: "unknown",
    fileName: sanitizeOriginalFileName(
      params.originalFileName ?? path.basename(params.filePath),
    ),
    totalRows: 0,
    parsedRows: 0,
    ignoredRows: 0,
    importedTransactions: 0,
    duplicateTransactions: 0,
    invalidRows: 0,
    versions: IMPORT_VERSIONS,
    errors: [],
    warnings: [],
  };
}

function sourceForFormat(format: "xls" | "xlsx" | "pdf"): ImportSource {
  if (format === "xls") return "itau_xls";
  if (format === "xlsx") return "itau_xlsx";
  return "itau_pdf";
}

function accountInfoFromMetadata(
  metadata: ParsedStatement["metadata"],
): ImportReport["accountInfo"] {
  if (!metadata.agency && !metadata.accountNumber && !metadata.holderName) return undefined;
  return {
    ...(metadata.agency ? { agency: metadata.agency } : {}),
    ...(metadata.accountNumber ? { accountNumber: metadata.accountNumber } : {}),
    ...(metadata.holderName ? { holderName: metadata.holderName } : {}),
  };
}

function invalidLineIssue(line: ParsedStatementLine): ImportIssue {
  const code = line.reasonCode ?? "INVALID_ROW";
  const messageByCode: Record<string, string> = {
    INVALID_AMOUNT: "A linha não possui um valor de lançamento válido.",
    MISSING_DESCRIPTION: "A linha não possui descrição.",
  };
  return {
    code,
    severity: "error",
    message: messageByCode[code] ?? "A linha do extrato é inválida.",
    rowNumber: line.sourceRowNumber,
  };
}

function buildCanonicalTransaction(params: {
  line: ParsedStatementLine;
  context: ImportBankStatementParams;
  source: ImportSource;
  occurrenceCounts: Map<string, number>;
  warnings: ImportIssue[];
}): ImportedBankTransaction {
  const { line, context, source, occurrenceCounts, warnings } = params;
  const date = normalizeImportedDate(line.rawDate);
  const description = normalizeImportedDescription(line.rawDescription);
  if (!description) {
    throw new ImportFileError("MISSING_DESCRIPTION", "A descrição do lançamento está ausente.", {
      rowNumber: line.sourceRowNumber,
    });
  }
  const amount = normalizeImportedValue(line.rawAmount);
  if (amount === 0) {
    throw new ImportFileError("ZERO_AMOUNT", "Lançamentos com valor zero não são aceitos.", {
      rowNumber: line.sourceRowNumber,
    });
  }

  const extraction = extractItauCounterparty(description);
  const identityInput = {
    companyId: context.companyId,
    bankAccountId: context.bankAccountId,
    date,
    amount,
    description,
    ...(extraction.documentNumber ? { documentNumber: extraction.documentNumber } : {}),
  };
  const baseKey = buildExternalIdBaseKey(identityInput);
  const occurrenceIndex = (occurrenceCounts.get(baseKey) ?? 0) + 1;
  occurrenceCounts.set(baseKey, occurrenceIndex);
  const externalId = generateExternalId({ ...identityInput, occurrenceIndex });

  let balanceAfter: number | undefined;
  if (line.rawBalance !== undefined && line.rawBalance !== null && line.rawBalance !== "") {
    try {
      balanceAfter = normalizeImportedValue(line.rawBalance);
    } catch {
      warnings.push({
        code: "INVALID_BALANCE",
        severity: "warning",
        message: "O saldo associado à linha não pôde ser interpretado e foi omitido.",
        rowNumber: line.sourceRowNumber,
      });
    }
  }

  const rowFingerprint = generateRowFingerprint({
    source,
    sourceFileId: context.sourceFileId,
    sourceRowNumber: line.sourceRowNumber,
    ...(line.pageNumber !== undefined ? { pageNumber: line.pageNumber } : {}),
    rawDate: line.rawDate,
    rawDescription: line.rawDescription,
    rawAmount: line.rawAmount,
  });

  return {
    companyId: context.companyId,
    bankAccountId: context.bankAccountId,
    source,
    sourceFileId: context.sourceFileId,
    sourceRowNumber: line.sourceRowNumber,
    date,
    description,
    amount,
    type: amount > 0 ? "income" : "expense",
    ...(balanceAfter !== undefined ? { balanceAfter } : {}),
    externalId,
    ...(extraction.counterpartyName
      ? { counterpartyName: extraction.counterpartyName }
      : {}),
    ...(extraction.documentNumber
      ? { documentNumber: extraction.documentNumber }
      : {}),
    rawData: {
      ...line.rawData,
      ...(line.pageNumber !== undefined ? { pageNumber: line.pageNumber } : {}),
      rowFingerprint,
      occurrenceIndex,
      ...(extraction.rule ? { extractionRule: extraction.rule } : {}),
      versions: IMPORT_VERSIONS,
    },
  };
}

export async function importBankStatement(
  params: ImportBankStatementParams,
): Promise<ImportBankStatementResult> {
  const report = createInitialReport(params);

  if (
    !params.filePath.trim() ||
    !params.companyId.trim() ||
    !params.bankAccountId.trim() ||
    !params.sourceFileId.trim()
  ) {
    report.errors.push({
      code: "INVALID_IMPORT_CONTEXT",
      severity: "error",
      message: "Arquivo, empresa, conta bancária e origem são obrigatórios.",
    });
    return { transactions: [], report };
  }

  try {
    const validatedFile = await validateImportFile({
      filePath: params.filePath,
      ...(params.originalFileName !== undefined
        ? { originalFileName: params.originalFileName }
        : {}),
      ...(params.maxFileSizeBytes !== undefined
        ? { maxFileSizeBytes: params.maxFileSizeBytes }
        : {}),
    });
    report.fileName = validatedFile.sanitizedFileName;
    report.detectedFormat = validatedFile.detectedFormat;

    const parsed =
      validatedFile.detectedFormat === "pdf"
        ? await parseItauPdf(validatedFile.buffer)
        : parseItauSpreadsheet(validatedFile.buffer, validatedFile.detectedFormat);

    report.detectedBank = parsed.detectedBank;
    report.detectedLayout = parsed.detectedLayout;
    report.totalRows = parsed.lines.length;
    const accountInfo = accountInfoFromMetadata(parsed.metadata);
    if (accountInfo) report.accountInfo = accountInfo;
    if (parsed.metadata.periodStart) report.periodStart = parsed.metadata.periodStart;
    if (parsed.metadata.periodEnd) report.periodEnd = parsed.metadata.periodEnd;
    for (const issue of parsed.issues) {
      (issue.severity === "error" ? report.errors : report.warnings).push(issue);
    }

    const ignoredLines = parsed.lines.filter(
      (line) => line.disposition === "ignored" || line.disposition === "future",
    );
    const futureCount = parsed.lines.filter((line) => line.disposition === "future").length;
    report.ignoredRows = ignoredLines.length;
    if (futureCount > 0) {
      report.warnings.push({
        code: "FUTURE_TRANSACTION_SKIPPED",
        severity: "warning",
        message: `${futureCount} lançamento(ões) futuro(s) foram ignorados no fluxo principal.`,
        rawValue: futureCount,
      });
    }

    const candidates: ImportedBankTransaction[] = [];
    const occurrenceCounts = new Map<string, number>();
    let invalidRows = 0;

    for (const line of parsed.lines) {
      if (line.disposition === "ignored" || line.disposition === "future") continue;
      if (line.disposition === "invalid") {
        invalidRows += 1;
        report.errors.push(invalidLineIssue(line));
        continue;
      }

      try {
        const transaction = buildCanonicalTransaction({
          line,
          context: params,
          source: sourceForFormat(parsed.detectedFormat),
          occurrenceCounts,
          warnings: report.warnings,
        });
        const validationIssues = validateImportedTransaction(transaction);
        if (validationIssues.length > 0) {
          invalidRows += 1;
          report.errors.push(...validationIssues);
          continue;
        }
        candidates.push(transaction);
      } catch (error) {
        invalidRows += 1;
        if (error instanceof ImportFileError) {
          report.errors.push({
            ...error.toIssue(),
            ...(error.rowNumber === undefined ? { rowNumber: line.sourceRowNumber } : {}),
          });
        } else {
          report.errors.push({
            code: "INVALID_ROW",
            severity: "error",
            message: "A linha não pôde ser convertida em transação.",
            rowNumber: line.sourceRowNumber,
          });
        }
      }
    }

    const deduplicated = deduplicateImportedTransactions(candidates);
    report.invalidRows = invalidRows;
    report.parsedRows = report.totalRows - invalidRows;
    report.duplicateTransactions = deduplicated.duplicates.length;
    report.importedTransactions = deduplicated.transactions.length;

    if (!report.periodStart || !report.periodEnd) {
      const dates = deduplicated.transactions.map((transaction) => transaction.date).sort();
      if (dates.length > 0) {
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];
        if (!report.periodStart && firstDate) report.periodStart = firstDate;
        if (!report.periodEnd && lastDate) report.periodEnd = lastDate;
        report.warnings.push({
          code: "STATEMENT_PERIOD_DERIVED",
          severity: "warning",
          message: "O período do extrato foi derivado das transações realizadas.",
        });
      }
    }

    if (deduplicated.transactions.length === 0) {
      report.errors.push({
        code: "NO_TRANSACTIONS_FOUND",
        severity: "error",
        message: "Nenhuma transação válida foi encontrada.",
      });
    }

    return { transactions: deduplicated.transactions, report };
  } catch (error) {
    if (error instanceof ImportFileError) {
      report.errors.push(error.toIssue());
    } else {
      report.errors.push({
        code: "IMPORT_FAILED",
        severity: "error",
        message: "Não foi possível processar o arquivo bancário.",
      });
    }
    return { transactions: [], report };
  }
}
