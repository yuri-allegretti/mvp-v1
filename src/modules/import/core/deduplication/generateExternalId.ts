import { createHash } from "node:crypto";
import { normalizeDescriptionForHash } from "../normalization/normalizeImportedDescription";
import { toMinorUnits } from "../normalization/normalizeImportedValue";
import { EXTERNAL_ID_VERSION } from "../versions";

export interface ExternalIdInput {
  companyId: string;
  bankAccountId: string;
  date: string;
  amount: number;
  description: string;
  documentNumber?: string;
  occurrenceIndex?: number;
}

function serializeField(name: string, value: string): string {
  return `${name.length}:${name}${value.length}:${value}`;
}

function serializeFields(fields: Array<[string, string]>): string {
  return fields.map(([name, value]) => serializeField(name, value)).join("");
}

function normalizeDocumentNumber(value: string | undefined): string {
  return value?.normalize("NFKC").trim().toUpperCase() ?? "";
}

export function buildExternalIdBaseKey(input: ExternalIdInput): string {
  return serializeFields([
    ["externalIdVersion", EXTERNAL_ID_VERSION],
    ["bank", "itau"],
    ["companyId", input.companyId],
    ["bankAccountId", input.bankAccountId],
    ["date", input.date],
    ["amountMinorUnits", String(toMinorUnits(input.amount))],
    ["normalizedDescription", normalizeDescriptionForHash(input.description)],
    ["documentComponent", normalizeDocumentNumber(input.documentNumber)],
  ]);
}

export function generateExternalId(input: ExternalIdInput): string {
  const occurrenceIndex = input.occurrenceIndex ?? 1;
  if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 1) {
    throw new Error("occurrenceIndex must be a positive integer");
  }
  const serialized = serializeFields([
    ["base", buildExternalIdBaseKey(input)],
    ["occurrenceIndex", String(occurrenceIndex)],
  ]);
  const digest = createHash("sha256").update(serialized, "utf8").digest("hex");
  return `${EXTERNAL_ID_VERSION}:${digest}`;
}

export function generateRowFingerprint(input: {
  source: string;
  sourceFileId: string;
  sourceRowNumber: number;
  pageNumber?: number;
  rawDate: unknown;
  rawDescription: unknown;
  rawAmount: unknown;
}): string {
  const serialized = serializeFields([
    ["source", input.source],
    ["sourceFileId", input.sourceFileId],
    ["sourceRowNumber", String(input.sourceRowNumber)],
    ["pageNumber", input.pageNumber === undefined ? "" : String(input.pageNumber)],
    ["rawDate", String(input.rawDate ?? "")],
    ["rawDescription", String(input.rawDescription ?? "")],
    ["rawAmount", String(input.rawAmount ?? "")],
  ]);
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}
