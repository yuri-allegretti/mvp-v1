import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ImportFileError } from "../errors";
import { detectItauPdfLayout } from "../itau/detectItauLayout";
import {
  isFutureSectionMarker,
  isItauNoiseDescription,
  isSummarySectionMarker,
  isTransactionHeader,
} from "../itau/itauNoiseFilters";
import { extractItauPdfMetadata } from "../itau/itauMetadataExtractor";
import { normalizeImportedDescription } from "../normalization/normalizeImportedDescription";
import type { ParsedStatement, ParsedStatementLine } from "./types";

const MAX_PDF_PAGES = 50;

interface PositionedText {
  x: number;
  y: number;
  text: string;
}

interface PdfTextRow {
  pageNumber: number;
  y: number;
  items: PositionedText[];
  text: string;
}

function groupPageRows(pageNumber: number, items: PositionedText[]): PdfTextRow[] {
  const groups: Array<{ y: number; items: PositionedText[] }> = [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  for (const item of sorted) {
    const group = groups.find((candidate) => Math.abs(candidate.y - item.y) <= 1.5);
    if (group) {
      group.items.push(item);
    } else {
      groups.push({ y: item.y, items: [item] });
    }
  }

  return groups
    .sort((a, b) => b.y - a.y)
    .map((group) => {
      const rowItems = group.items.sort((a, b) => a.x - b.x);
      return {
        pageNumber,
        y: group.y,
        items: rowItems,
        text: rowItems.map((item) => item.text).join(" "),
      };
    });
}

function parsePdfTableRow(
  row: PdfTextRow,
  sourceRowNumber: number,
  state: "realized" | "future",
): ParsedStatementLine | null {
  const dateItem = row.items.find(
    (item) => item.x < 75 && /^\d{2}\/\d{2}\/\d{4}$/.test(item.text.trim()),
  );
  if (!dateItem) return null;

  const description = row.items
    .filter((item) => item.x >= 75 && item.x < 400)
    .map((item) => item.text)
    .join(" ");
  if (!normalizeImportedDescription(description)) {
    return {
      sourceRowNumber,
      pageNumber: row.pageNumber,
      rawDate: dateItem.text,
      rawDescription: description,
      rawAmount: null,
      disposition: "invalid",
      reasonCode: "MISSING_DESCRIPTION",
      rawData: { pageNumber: row.pageNumber, y: row.y, items: row.items },
    };
  }

  const amount = row.items
    .filter((item) => item.x >= 400 && item.x < 500)
    .map((item) => item.text)
    .join("");
  const balance = row.items
    .filter((item) => item.x >= 500)
    .map((item) => item.text)
    .join("");
  const rawData = { pageNumber: row.pageNumber, y: row.y, items: row.items };

  if (state === "future") {
    return {
      sourceRowNumber,
      pageNumber: row.pageNumber,
      rawDate: dateItem.text,
      rawDescription: description,
      rawAmount: amount,
      ...(balance ? { rawBalance: balance } : {}),
      disposition: "future",
      reasonCode: "FUTURE_TRANSACTION_SKIPPED",
      rawData,
    };
  }

  if (isItauNoiseDescription(description)) {
    return {
      sourceRowNumber,
      pageNumber: row.pageNumber,
      rawDate: dateItem.text,
      rawDescription: description,
      rawAmount: amount,
      ...(balance ? { rawBalance: balance } : {}),
      disposition: "ignored",
      reasonCode: "IGNORED_BALANCE_ROW",
      rawData,
    };
  }

  return {
    sourceRowNumber,
    pageNumber: row.pageNumber,
    rawDate: dateItem.text,
    rawDescription: description,
    rawAmount: amount,
    ...(balance ? { rawBalance: balance } : {}),
    disposition: amount ? "candidate" : "invalid",
    ...(!amount ? { reasonCode: "INVALID_AMOUNT" } : {}),
    rawData,
  };
}

export async function parseItauPdf(buffer: Buffer): Promise<ParsedStatement> {
  let pdf;
  try {
    pdf = await getDocument({ data: Uint8Array.from(buffer) }).promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new ImportFileError(
        "PASSWORD_PROTECTED_FILE",
        "PDFs protegidos por senha não são aceitos.",
      );
    }
    throw new ImportFileError("CORRUPTED_FILE", "O PDF não pôde ser lido.");
  }

  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new ImportFileError(
      "TOO_MANY_PAGES",
      `O PDF excede o limite de ${MAX_PDF_PAGES} páginas.`,
    );
  }

  const rows: PdfTextRow[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: PositionedText[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      items.push({
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        text: item.str,
      });
    }
    rows.push(...groupPageRows(pageNumber, items));
  }

  if (rows.length === 0) {
    throw new ImportFileError(
      "SCANNED_PDF_NOT_SUPPORTED",
      "O PDF não possui uma camada de texto utilizável. OCR não é suportado.",
    );
  }

  const textLines = rows.map((row) => row.text);
  const detection = detectItauPdfLayout(textLines);
  if (detection.bank !== "itau") {
    throw new ImportFileError(
      "BANK_NOT_DETECTED",
      "O PDF não foi reconhecido como um extrato Itaú.",
    );
  }
  if (detection.layout !== "itau-layout-v1") {
    throw new ImportFileError(
      "UNSUPPORTED_PDF_LAYOUT",
      "O layout do PDF Itaú não é suportado.",
    );
  }

  let state: "metadata" | "realized" | "future" | "done" = "metadata";
  let logicalRowNumber = 0;
  const lines: ParsedStatementLine[] = [];

  for (const row of rows) {
    if (isFutureSectionMarker(row.text)) {
      state = "future";
      continue;
    }
    if (isSummarySectionMarker(row.text)) {
      state = "done";
      continue;
    }
    if (state === "done") continue;
    if (isTransactionHeader(row.items.map((item) => item.text))) {
      if (state !== "future") state = "realized";
      continue;
    }
    if (state !== "realized" && state !== "future") continue;

    const nextRowNumber = logicalRowNumber + 1;
    const line = parsePdfTableRow(row, nextRowNumber, state);
    if (!line) continue;
    logicalRowNumber = nextRowNumber;
    lines.push(line);
  }

  if (!lines.some((line) => line.disposition === "candidate")) {
    throw new ImportFileError(
      "NO_TRANSACTIONS_FOUND",
      "Nenhum lançamento realizado foi encontrado no PDF.",
    );
  }

  return {
    detectedBank: "itau",
    detectedFormat: "pdf",
    detectedLayout: "itau-layout-v1",
    metadata: extractItauPdfMetadata(textLines),
    lines,
    issues: [],
  };
}
