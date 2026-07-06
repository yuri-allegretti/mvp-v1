import { ImportFileError } from "../errors";

const MS_PER_DAY = 86_400_000;

function toIsoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ImportFileError("INVALID_DATE", "A data do lançamento é inválida.");
  }
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function normalizeImportedDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(value) * MS_PER_DAY);
    return toIsoDate(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }

  if (typeof value !== "string") {
    throw new ImportFileError("INVALID_DATE", "A data do lançamento está ausente.");
  }

  const text = value.trim();
  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (brazilian) {
    return toIsoDate(
      Number(brazilian[3]),
      Number(brazilian[2]),
      Number(brazilian[1]),
    );
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  throw new ImportFileError("INVALID_DATE", "A data do lançamento tem formato inválido.");
}
