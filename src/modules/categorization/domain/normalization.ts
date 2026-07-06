export interface NormalizedTransactionContext {
  description: string;
  counterparty: string | null;
  document: string | null;
  absoluteAmount: number;
}

export function normalizeText(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeTransaction(input: {
  description: string;
  counterpartyName: string | null;
  documentNumber: string | null;
  amount: number;
}): NormalizedTransactionContext {
  const counterparty = input.counterpartyName ? normalizeText(input.counterpartyName) : null;
  const document = input.documentNumber ? normalizeDocument(input.documentNumber) : null;

  return {
    description: normalizeText(input.description),
    counterparty: counterparty || null,
    document: document || null,
    absoluteAmount: Math.abs(input.amount),
  };
}
