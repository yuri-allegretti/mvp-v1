import type { NormalizedTransaction } from "../types.ts";
import { dayOfMonth } from "../utils/dateUtils.ts";
import { getDistinctiveTokens } from "./economicIdentity.ts";

export interface EconomicCandidateGroup {
  key: string;
  source: "economic_identity" | "income_track";
  identityScore: number;
  identityReason: string;
  transactions: NormalizedTransaction[];
}

export function generateEconomicIdentityCandidates(
  transactions: NormalizedTransaction[]
): EconomicCandidateGroup[] {
  const keyed = new Map<string, EconomicCandidateGroup>();

  for (const transaction of transactions) {
    const prefix = `${transaction.companyId}|${transaction.type}`;
    const document = transaction.documentNumber?.replace(/\D/g, "");
    const distinctive = getDistinctiveTokens(transaction);
    const identities: Array<[string, number, string]> = [
      ...(document ? [[`document:${document}`, 0.98, "documento economico"] as [string, number, string]] : []),
      ...(transaction.normalizedCounterparty
        ? [[`counterparty:${transaction.normalizedCounterparty}`, 0.95, "contraparte"] as [string, number, string]]
        : []),
      ...(transaction.normalizedDescription && distinctive.length > 0
        ? [[`description:${transaction.normalizedDescription}`, 0.92, "descricao normalizada"] as [string, number, string]]
        : []),
      ...tokenPairKeys(distinctive).map((key) => [key, 0.88, "dois tokens distintivos"] as [string, number, string]),
      ...distinctive.map((token) => [`token:${token}`, 0.72, "nucleo distintivo"] as [string, number, string])
    ];

    for (const [identity, identityScore, identityReason] of identities) {
      const key = `${prefix}|${identity}`;
      const candidate = keyed.get(key) ?? {
        key,
        source: "economic_identity",
        identityScore,
        identityReason,
        transactions: []
      };
      candidate.transactions.push(transaction);
      keyed.set(key, candidate);
    }
  }

  const candidates = [...keyed.values()]
    .filter((candidate) => candidate.transactions.length >= 3)
    .flatMap((candidate) => expandCandidateTracks(candidate));

  candidates.push(...generateIncomeTrackCandidates(transactions));

  return deduplicateCandidates(candidates);
}

function generateIncomeTrackCandidates(
  transactions: NormalizedTransaction[]
): EconomicCandidateGroup[] {
  const income = transactions.filter((transaction) => transaction.type === "income");
  const candidates: EconomicCandidateGroup[] = [];

  for (const anchor of income) {
    const compatible = income.filter((transaction) =>
      transaction.companyId === anchor.companyId &&
      Math.abs(dayOfMonth(transaction.date) - dayOfMonth(anchor.date)) <= 2 &&
      relativeAmountDifference(transaction.absoluteAmount, anchor.absoluteAmount) <= 0.55
    );
    const track = selectBestIncomePerMonth(compatible, anchor);
    if (track.length < 4) continue;
    candidates.push({
      key: `${anchor.companyId}|income|track:${anchor.id}`,
      source: "income_track",
      identityScore: 0.68,
      identityReason: "trilha de receita por competencia e faixa relativa de valor",
      transactions: track
    });
  }

  return candidates;
}

function selectBestIncomePerMonth(
  transactions: NormalizedTransaction[],
  anchor: NormalizedTransaction
): NormalizedTransaction[] {
  const descriptionCounts = new Map<string, number>();
  for (const transaction of transactions) {
    const description = transaction.normalizedDescription;
    descriptionCounts.set(description, (descriptionCounts.get(description) ?? 0) + 1);
  }

  const byMonth = new Map<string, NormalizedTransaction[]>();
  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    const values = byMonth.get(month) ?? [];
    values.push(transaction);
    byMonth.set(month, values);
  }

  return [...byMonth.values()].map((values) => [...values].sort((left, right) => {
    const frequencyDelta =
      (descriptionCounts.get(right.normalizedDescription) ?? 0) -
      (descriptionCounts.get(left.normalizedDescription) ?? 0);
    if (frequencyDelta !== 0) return frequencyDelta;
    return relativeAmountDifference(left.absoluteAmount, anchor.absoluteAmount) -
      relativeAmountDifference(right.absoluteAmount, anchor.absoluteAmount);
  })[0]).filter((transaction): transaction is NormalizedTransaction => Boolean(transaction));
}

function expandCandidateTracks(candidate: EconomicCandidateGroup): EconomicCandidateGroup[] {
  const result = [candidate];
  if (candidate.transactions.length < 5) return result;

  for (const anchor of candidate.transactions) {
    const monthlyLane = candidate.transactions.filter((transaction) =>
      Math.abs(dayOfMonth(transaction.date) - dayOfMonth(anchor.date)) <= 3
    );
    if (monthlyLane.length >= 3 && monthlyLane.length < candidate.transactions.length) {
      result.push({
        ...candidate,
        key: `${candidate.key}|day:${dayOfMonth(anchor.date)}`,
        transactions: monthlyLane
      });
    }

    const amountLane = candidate.transactions.filter((transaction) =>
      relativeAmountDifference(transaction.absoluteAmount, anchor.absoluteAmount) <= 0.35
    );
    if (amountLane.length >= 3 && amountLane.length < candidate.transactions.length) {
      result.push({
        ...candidate,
        key: `${candidate.key}|amount:${anchor.amountBucketIndex}`,
        transactions: amountLane
      });
    }
  }

  return result;
}

function tokenPairKeys(tokens: string[]): string[] {
  const result: string[] = [];
  for (let left = 0; left < tokens.length; left += 1) {
    for (let right = left + 1; right < tokens.length; right += 1) {
      result.push(`tokens:${tokens[left]}+${tokens[right]}`);
    }
  }
  return result;
}

function deduplicateCandidates(candidates: EconomicCandidateGroup[]): EconomicCandidateGroup[] {
  const byTransactions = new Map<string, EconomicCandidateGroup>();
  for (const candidate of candidates) {
    const sorted = uniqueTransactions(candidate.transactions)
      .sort((left, right) => left.date.localeCompare(right.date));
    const signature = sorted.map((transaction) => transaction.id).sort().join("|");
    const previous = byTransactions.get(signature);
    if (!previous || candidate.identityScore > previous.identityScore) {
      byTransactions.set(signature, { ...candidate, transactions: sorted });
    }
  }
  return [...byTransactions.values()];
}

function uniqueTransactions(transactions: NormalizedTransaction[]): NormalizedTransaction[] {
  return [...new Map(transactions.map((transaction) => [transaction.id, transaction])).values()];
}

function relativeAmountDifference(left: number, right: number): number {
  const denominator = (left + right) / 2;
  return denominator === 0 ? 0 : Math.abs(left - right) / denominator;
}
