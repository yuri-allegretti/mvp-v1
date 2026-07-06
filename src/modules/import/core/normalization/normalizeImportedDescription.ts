function suspiciousEncodingCount(value: string): number {
  return (value.match(/[ÃÂ�\u0080-\u009f]/g) ?? []).length;
}

export function repairKnownMojibake(value: string): string {
  if (!/[ÃÂ\u0080-\u009f]/.test(value)) return value;

  const decoded = Buffer.from(value, "latin1").toString("utf8");
  if (decoded.includes("�")) return value;

  return suspiciousEncodingCount(decoded) < suspiciousEncodingCount(value)
    ? decoded
    : value;
}

export function normalizeImportedDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  return repairKnownMojibake(value).normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeControlText(value: unknown): string {
  return normalizeImportedDescription(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function normalizeDescriptionForHash(value: string): string {
  return normalizeImportedDescription(value).toUpperCase();
}
