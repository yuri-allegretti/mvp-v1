import { normalizeImportedDate } from "../normalization/normalizeImportedDate";
import { normalizeControlText, normalizeImportedDescription } from "../normalization/normalizeImportedDescription";
import type { ParsedStatementMetadata } from "../parsers/types";

export function extractItauSpreadsheetMetadata(
  rows: unknown[][],
): ParsedStatementMetadata {
  const metadata: ParsedStatementMetadata = {};
  for (const row of rows.slice(0, 15)) {
    const label = normalizeControlText(row[0]);
    const value = normalizeImportedDescription(row[1]);
    if (!value) continue;
    if (label === "NOME:") metadata.holderName = value;
    if (label === "AGENCIA:") metadata.agency = value.trim();
    if (label === "CONTA:") metadata.accountNumber = value.trim();
  }
  return metadata;
}

export function extractItauPdfMetadata(lines: string[]): ParsedStatementMetadata {
  const metadata: ParsedStatementMetadata = {};

  for (const rawLine of lines) {
    const line = normalizeImportedDescription(rawLine);
    const period = /per[ií]odo de visualiza[cç][aã]o:\s*de\s*(\d{2}\/\d{2}\/\d{4})\s*at[eé]\s*(\d{2}\/\d{2}\/\d{4})/i.exec(line);
    if (period?.[1] && period[2]) {
      metadata.periodStart = normalizeImportedDate(period[1]);
      metadata.periodEnd = normalizeImportedDate(period[2]);
    }

    const agency = /ag[eê]ncia:\s*([0-9-]+)/i.exec(line);
    if (agency?.[1]) metadata.agency = agency[1];

    const account = /conta:\s*([0-9-]+)/i.exec(line);
    if (account?.[1]) metadata.accountNumber = account[1];

    const holder = /^(.+?)\s+CPF:/i.exec(line);
    if (holder?.[1]) metadata.holderName = holder[1].trim();
  }

  return metadata;
}
