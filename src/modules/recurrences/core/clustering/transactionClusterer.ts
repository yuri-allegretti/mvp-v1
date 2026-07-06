import { DEFAULT_THRESHOLDS, type ThresholdConfig } from "../config/defaultThresholds.ts";
import {
  GENERIC_IDENTITY_TOKENS
} from "../identity/economicIdentity.ts";
import { compareTransactionsText } from "../similarity/textSimilarity.ts";
import type { NormalizedTransaction } from "../types.ts";
import { isMonthlyCadencePair } from "../utils/dateUtils.ts";

const VARIABLE_ECONOMIC_ALIAS_GROUPS = new Set([
  "energy"
]);

const STRICT_ECONOMIC_ALIAS_GROUPS = new Set([
  "rent", "insurance", "payroll", "commission", "taxes"
]);

export function clusterSimilarTransactions(
  transactions: NormalizedTransaction[],
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS
): NormalizedTransaction[][] {
  const parent = new Map<string, string>();
  for (const transaction of transactions) {
    parent.set(transaction.id, transaction.id);
  }

  for (let leftIndex = 0; leftIndex < transactions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < transactions.length; rightIndex += 1) {
      const left = transactions[leftIndex];
      const right = transactions[rightIndex];
      if (!left || !right) continue;

      if (shouldLinkTransactions(left, right, thresholds)) {
        union(parent, left.id, right.id);
      }
    }
  }

  const clusters = new Map<string, NormalizedTransaction[]>();
  for (const transaction of transactions) {
    const root = find(parent, transaction.id);
    const cluster = clusters.get(root) ?? [];
    cluster.push(transaction);
    clusters.set(root, cluster);
  }

  return [...clusters.values()]
    .filter((cluster) => cluster.length >= 2)
    .map((cluster) => cluster.sort((left, right) => left.date.localeCompare(right.date)));
}

function shouldLinkTransactions(
  left: NormalizedTransaction,
  right: NormalizedTransaction,
  thresholds: ThresholdConfig
): boolean {
  if (left.companyId !== right.companyId || left.type !== right.type) {
    return false;
  }

  const text = compareTransactionsText(left, right);
  const amountDiff = relativeAmountDifference(left.absoluteAmount, right.absoluteAmount);
  if (
    !isMonthlyCadencePair(left.date, right.date, thresholds) ||
    amountDiff > thresholds.monthlyVariableAmountRelativeTolerance
  ) {
    return false;
  }

  if (sameDocument(left, right) || sameCounterparty(left, right)) {
    return true;
  }

  const specificCommonTokens = text.commonTokens.filter(
    (token) => !GENERIC_IDENTITY_TOKENS.has(token)
  );
  const hasVariableEconomicAlias = text.sharedAliasGroups.some(
    (group) => VARIABLE_ECONOMIC_ALIAS_GROUPS.has(group)
  );
  const hasStrictEconomicAlias = text.sharedAliasGroups.some(
    (group) => STRICT_ECONOMIC_ALIAS_GROUPS.has(group)
  );

  return (
    sameInstallmentSeries(left, right, specificCommonTokens) ||
    hasDistinctiveMerchantIdentity(left, right) ||
    hasVariableEconomicAlias ||
    (hasStrictEconomicAlias && amountDiff <= thresholds.strictAmountRelativeTolerance)
  );
}

export function hasDistinctiveMerchantIdentity(
  left: NormalizedTransaction,
  right: NormalizedTransaction
): boolean {
  if (sameDocument(left, right) || sameCounterparty(left, right)) {
    return true;
  }

  const text = compareTransactionsText(left, right);
  const specificCommonTokens = text.commonTokens.filter(
    (token) => !GENERIC_IDENTITY_TOKENS.has(token)
  );

  return (
    specificCommonTokens.length >= 2 ||
    (specificCommonTokens.length >= 1 && text.commonTokens.length >= 2) ||
    (specificCommonTokens.length >= 1 && text.sharedAliasGroups.length > 0)
  );
}

function sameInstallmentSeries(
  left: NormalizedTransaction,
  right: NormalizedTransaction,
  specificCommonTokens: string[]
): boolean {
  const leftInstallment = extractInstallment(left.description);
  const rightInstallment = extractInstallment(right.description);

  return Boolean(
    leftInstallment &&
    rightInstallment &&
    leftInstallment.total === rightInstallment.total &&
    leftInstallment.current !== rightInstallment.current &&
    specificCommonTokens.length >= 1
  );
}

function extractInstallment(description: string): { current: number; total: number } | undefined {
  const match = description.match(/(?:parcela\s*)?(\d{1,2})\s*\/\s*(\d{1,2})/i);
  if (!match) return undefined;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (current < 1 || total < 2 || current > total) return undefined;
  return { current, total };
}

function sameDocument(left: NormalizedTransaction, right: NormalizedTransaction): boolean {
  const leftDocument = left.documentNumber?.replace(/\D/g, "");
  const rightDocument = right.documentNumber?.replace(/\D/g, "");
  return Boolean(leftDocument && rightDocument && leftDocument === rightDocument);
}

function sameCounterparty(left: NormalizedTransaction, right: NormalizedTransaction): boolean {
  return Boolean(
    left.normalizedCounterparty &&
    right.normalizedCounterparty &&
    left.normalizedCounterparty === right.normalizedCounterparty
  );
}

function relativeAmountDifference(left: number, right: number): number {
  const denominator = (left + right) / 2;
  if (denominator === 0) {
    return 0;
  }

  return Math.abs(left - right) / denominator;
}

function find(parent: Map<string, string>, id: string): string {
  const current = parent.get(id);
  if (!current || current === id) {
    return id;
  }

  const root = find(parent, current);
  parent.set(id, root);
  return root;
}

function union(parent: Map<string, string>, left: string, right: string): void {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) {
    parent.set(rightRoot, leftRoot);
  }
}
