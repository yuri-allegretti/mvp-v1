import * as XLSX from "xlsx";
import { ImportFileError } from "../errors";
import { detectItauSpreadsheetLayout } from "../itau/detectItauLayout";
import {
  isFutureSectionMarker,
  isItauNoiseDescription,
  isSummarySectionMarker,
  isTransactionHeader,
} from "../itau/itauNoiseFilters";
import { extractItauSpreadsheetMetadata } from "../itau/itauMetadataExtractor";
import { normalizeControlText, normalizeImportedDescription } from "../normalization/normalizeImportedDescription";
import type { DetectedFormat } from "../types";
import type { ParsedStatement, ParsedStatementLine } from "./types";

type WorkbookWithVba = XLSX.WorkBook & { vbaraw?: unknown };

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
}

function findHeaderIndex(rows: unknown[][]): number {
  return rows.slice(0, 30).findIndex(isTransactionHeader);
}

function findColumnIndexes(header: unknown[]): {
  date: number;
  description: number;
  amount: number;
  balance?: number;
  origin?: number;
} {
  const normalized = header.map(normalizeControlText);
  const date = normalized.findIndex((value) => value === "DATA");
  const description = normalized.findIndex((value) => value.startsWith("LANCAMENTO"));
  const amount = normalized.findIndex((value) => value.startsWith("VALOR"));
  const balance = normalized.findIndex((value) => value.startsWith("SALDO"));
  const origin = normalized.findIndex((value) => value.includes("ORIGEM"));

  if (date < 0 || description < 0 || amount < 0) {
    throw new ImportFileError(
      "HEADER_NOT_FOUND",
      "O cabeçalho de lançamentos do Itaú não foi encontrado.",
    );
  }

  return {
    date,
    description,
    amount,
    ...(balance >= 0 ? { balance } : {}),
    ...(origin >= 0 ? { origin } : {}),
  };
}

export function parseItauSpreadsheet(
  buffer: Buffer,
  detectedFormat: Extract<DetectedFormat, "xls" | "xlsx">,
): ParsedStatement {
  let workbook: WorkbookWithVba;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      raw: true,
      cellDates: false,
      cellFormula: false,
      bookVBA: true,
    }) as WorkbookWithVba;
  } catch {
    throw new ImportFileError(
      "CORRUPTED_FILE",
      "A planilha não pôde ser lida como um arquivo Excel válido.",
    );
  }

  if (workbook.vbaraw) {
    throw new ImportFileError(
      "MACRO_NOT_ALLOWED",
      "Planilhas com macros não são aceitas.",
    );
  }

  const rowsBySheet = new Map<string, unknown[][]>();
  for (const sheetName of workbook.SheetNames) {
    rowsBySheet.set(sheetName, sheetRows(workbook, sheetName));
  }

  const detection = detectItauSpreadsheetLayout(workbook.SheetNames, rowsBySheet);
  if (detection.bank !== "itau") {
    throw new ImportFileError(
      "BANK_NOT_DETECTED",
      "O arquivo não foi reconhecido como um extrato Itaú.",
    );
  }
  if (detection.layout !== "itau-layout-v1") {
    throw new ImportFileError(
      "LAYOUT_NOT_SUPPORTED",
      "O layout do extrato Itaú não é suportado.",
    );
  }

  const selectedSheetName =
    workbook.SheetNames.find((name) => normalizeControlText(name) === "LANCAMENTOS") ??
    workbook.SheetNames.find((name) => findHeaderIndex(rowsBySheet.get(name) ?? []) >= 0);
  if (!selectedSheetName) {
    throw new ImportFileError(
      "HEADER_NOT_FOUND",
      "Nenhuma aba de lançamentos compatível foi encontrada.",
    );
  }

  const rows = rowsBySheet.get(selectedSheetName) ?? [];
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) {
    throw new ImportFileError(
      "HEADER_NOT_FOUND",
      "O cabeçalho de lançamentos do Itaú não foi encontrado.",
    );
  }
  const header = rows[headerIndex];
  if (!header) {
    throw new ImportFileError("HEADER_NOT_FOUND", "O cabeçalho está vazio.");
  }
  const columns = findColumnIndexes(header);

  let state: "realized" | "future" = "realized";
  const lines: ParsedStatementLine[] = [];

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const rowText = row.map(normalizeImportedDescription).filter(Boolean).join(" ");
    if (!rowText) continue;

    if (isFutureSectionMarker(rowText)) {
      state = "future";
      continue;
    }
    if (isSummarySectionMarker(rowText)) {
      break;
    }

    const rawDate = row[columns.date];
    const rawDescription = row[columns.description];
    const description = normalizeImportedDescription(rawDescription);
    const looksLikeDate =
      typeof rawDate === "number" ||
      (typeof rawDate === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(rawDate.trim()));
    if (!looksLikeDate || !description) continue;

    const rawAmount = row[columns.amount];
    const rawBalance = columns.balance === undefined ? undefined : row[columns.balance];
    const sourceRowNumber = rowIndex + 1;
    const rawData: Record<string, unknown> = {
      sheetName: selectedSheetName,
      cells: row,
      ...(columns.origin !== undefined ? { origin: row[columns.origin] } : {}),
    };

    if (state === "future") {
      lines.push({
        sourceRowNumber,
        rawDate,
        rawDescription,
        rawAmount,
        ...(rawBalance !== undefined ? { rawBalance } : {}),
        disposition: "future",
        reasonCode: "FUTURE_TRANSACTION_SKIPPED",
        rawData,
      });
      continue;
    }

    if (isItauNoiseDescription(description)) {
      lines.push({
        sourceRowNumber,
        rawDate,
        rawDescription,
        rawAmount,
        ...(rawBalance !== undefined ? { rawBalance } : {}),
        disposition: "ignored",
        reasonCode: "IGNORED_BALANCE_ROW",
        rawData,
      });
      continue;
    }

    const hasAmount = rawAmount !== null && rawAmount !== undefined && rawAmount !== "";
    lines.push({
      sourceRowNumber,
      rawDate,
      rawDescription,
      rawAmount,
      ...(rawBalance !== undefined ? { rawBalance } : {}),
      disposition: hasAmount ? "candidate" : "invalid",
      ...(!hasAmount ? { reasonCode: "INVALID_AMOUNT" } : {}),
      rawData,
    });
  }

  return {
    detectedBank: "itau",
    detectedFormat,
    detectedLayout: "itau-layout-v1",
    metadata: extractItauSpreadsheetMetadata(rows),
    lines,
    issues: [],
  };
}
