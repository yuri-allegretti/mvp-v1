import { ImportFileError } from "../errors";

export function toMinorUnits(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function normalizeImportedValue(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ImportFileError("INVALID_AMOUNT", "O valor do lançamento é inválido.");
    }
    return toMinorUnits(value) / 100;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new ImportFileError("INVALID_AMOUNT", "O valor do lançamento está ausente.");
  }

  let text = value.trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  let negative = false;
  if (/^\(.+\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  if (!/^[+-]?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,2})?$/.test(text)) {
    if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text)) {
      throw new ImportFileError("INVALID_AMOUNT", "O valor do lançamento tem formato inválido.");
    }
  } else {
    text = text.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    throw new ImportFileError("INVALID_AMOUNT", "O valor do lançamento é inválido.");
  }

  const amount = (negative ? -Math.abs(parsed) : parsed);
  return toMinorUnits(amount) / 100;
}
