import { DEFAULT_STOP_WORDS, DEFAULT_THRESHOLDS, type ThresholdConfig } from "../config/defaultThresholds.ts";
import { extractDocumentNumber } from "../identity/economicIdentity.ts";
import type { NormalizedTransaction, Transaction } from "../types.ts";

const CONTROLLED_TOKEN_EQUIVALENCES: Record<string, string> = {
  servicos: "servico",
  sistemas: "sistema",
  seguros: "seguro",
  pecas: "peca",
  empresas: "empresa",
  empresarial: "empresa"
};

export function normalizeTransactions(
  transactions: Transaction[],
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS
): NormalizedTransaction[] {
  return transactions.map((transaction) => {
    const descriptionTokens = normalizeText(transaction.description);
    const counterpartyTokens = normalizeText(transaction.counterpartyName ?? "");
    const mergedTokens = uniquePreservingOrder([...descriptionTokens, ...counterpartyTokens]);

    return {
      ...transaction,
      documentNumber: transaction.documentNumber ?? extractDocumentNumber(transaction.description),
      normalizedDescription: mergedTokens.join(" "),
      normalizedTokens: mergedTokens,
      normalizedCounterparty: counterpartyTokens.join(" ") || undefined,
      absoluteAmount: Math.abs(transaction.amount),
      amountBucketIndex: getAmountBucketIndex(Math.abs(transaction.amount), thresholds.amountBands)
    };
  });
}

export function normalizeText(value: string): string[] {
  if (!value.trim()) {
    return [];
  }

  const cleaned = removeDatesAndCodes(stripAccents(value.toLowerCase()))
    .replace(/\bs\/a\b/g, " sa ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!cleaned) {
    return [];
  }

  const tokens = cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .map((token) => CONTROLLED_TOKEN_EQUIVALENCES[token] ?? token)
    .filter(Boolean)
    .filter((token) => token.length > 1)
    .filter((token) => !/\d/.test(token))
    .filter((token) => !DEFAULT_STOP_WORDS.has(token));

  return uniquePreservingOrder(tokens);
}

export function getAmountBucketIndex(amount: number, bands: readonly number[]): number {
  for (let index = 0; index < bands.length - 1; index += 1) {
    const lower = bands[index] ?? 0;
    const upper = bands[index + 1] ?? Number.POSITIVE_INFINITY;
    if (amount >= lower && amount < upper) {
      return index;
    }
  }

  return bands.length - 1;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function removeDatesAndCodes(value: string): string {
  return value
    .replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}[-/.]\d{4}\b/g, " ")
    .replace(/\b\d{1,2}[-/.]\d{1,2}\b/g, " ")
    .replace(/\b\d{6,}\b/g, " ");
}

function uniquePreservingOrder(tokens: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }

  return result;
}
