import { normalizeControlText } from "../normalization/normalizeImportedDescription";
import { isTransactionHeader } from "./itauNoiseFilters";

export interface LayoutDetection {
  bank: "itau" | "unknown";
  layout: "itau-layout-v1" | "itau-layout-unknown";
  confidence: number;
}

export function detectItauSpreadsheetLayout(
  sheetNames: string[],
  rowsBySheet: Map<string, unknown[][]>,
): LayoutDetection {
  let confidence = 0;
  const normalizedNames = sheetNames.map(normalizeControlText);
  if (normalizedNames.includes("LANCAMENTOS")) confidence += 0.25;
  if (normalizedNames.includes("POSICAO CONSOLIDADA")) confidence += 0.1;

  let hasHeader = false;
  let hasItauMarker = false;
  for (const rows of rowsBySheet.values()) {
    const firstRows = rows.slice(0, 15);
    if (firstRows.some(isTransactionHeader)) hasHeader = true;
    const text = firstRows.flat().map(normalizeControlText).join(" ");
    if (text.includes("ITAU")) hasItauMarker = true;
  }
  if (hasHeader) confidence += 0.45;
  if (hasItauMarker) confidence += 0.2;

  return hasHeader && hasItauMarker && confidence >= 0.75
    ? { bank: "itau", layout: "itau-layout-v1", confidence }
    : {
        bank: hasItauMarker ? "itau" : "unknown",
        layout: "itau-layout-unknown",
        confidence,
      };
}

export function detectItauPdfLayout(textLines: string[]): LayoutDetection {
  const text = textLines.map(normalizeControlText).join(" ");
  let confidence = 0;
  const hasItau = text.includes("ITAU");
  const hasStatement = text.includes("EXTRATO CONTA CORRENTE");
  const hasTransactions = text.includes("LANCAMENTOS");
  const hasColumns = text.includes("DATA") && text.includes("VALOR (R$)");

  if (hasItau) confidence += 0.2;
  if (hasStatement) confidence += 0.25;
  if (hasTransactions) confidence += 0.2;
  if (hasColumns) confidence += 0.35;

  return hasItau && hasStatement && hasTransactions && hasColumns
    ? { bank: "itau", layout: "itau-layout-v1", confidence }
    : {
        bank: hasItau ? "itau" : "unknown",
        layout: "itau-layout-unknown",
        confidence,
      };
}
