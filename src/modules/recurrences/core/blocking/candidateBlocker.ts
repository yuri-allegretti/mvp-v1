import { DEFAULT_THRESHOLDS, type ThresholdConfig } from "../config/defaultThresholds.ts";
import { getDistinctiveTokens } from "../identity/economicIdentity.ts";
import type { CandidateBlock, NormalizedTransaction } from "../types.ts";

export function createCandidateBlocks(
  transactions: NormalizedTransaction[],
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS
): CandidateBlock[] {
  const companyTypeBuckets = new Map<string, Map<number, NormalizedTransaction[]>>();

  for (const transaction of transactions) {
    const companyTypeKey = `${transaction.companyId}|${transaction.type}`;
    const buckets = getOrCreate(companyTypeBuckets, companyTypeKey, () => new Map<number, NormalizedTransaction[]>());
    const bucket = getOrCreate(buckets, transaction.amountBucketIndex, () => []);
    bucket.push(transaction);
  }

  const blocks: CandidateBlock[] = [];

  for (const [companyTypeKey, buckets] of companyTypeBuckets) {
    const [companyId, type] = companyTypeKey.split("|") as [string, NormalizedTransaction["type"]];
    const bucketIndexes = [...buckets.keys()].sort((left, right) => left - right);

    for (const bucketIndex of bucketIndexes) {
      const expanded = uniqueTransactions([
        ...(buckets.get(bucketIndex - 1) ?? []),
        ...(buckets.get(bucketIndex) ?? []),
        ...(buckets.get(bucketIndex + 1) ?? [])
      ]);

      if (expanded.length < 2) {
        continue;
      }

      blocks.push({
        key: `${companyTypeKey}|amountBucket:${bucketIndex}`,
        companyId,
        type,
        amountBucketIndex: bucketIndex,
        transactions: expanded
      });
    }
  }

  const economicIdentityBlocks = new Map<string, NormalizedTransaction[]>();
  for (const transaction of transactions) {
    const prefix = `${transaction.companyId}|${transaction.type}`;
    const document = transaction.documentNumber?.replace(/\D/g, "");
    const keys = [
      ...(document ? [`document:${document}`] : []),
      ...(transaction.normalizedCounterparty
        ? [`counterparty:${transaction.normalizedCounterparty}`]
        : []),
      ...(transaction.normalizedDescription
        ? [`description:${transaction.normalizedDescription}`]
        : []),
      ...distinctiveTokenPairKeys(getDistinctiveTokens(transaction))
    ];

    for (const key of keys) {
      const values = economicIdentityBlocks.get(`${prefix}|${key}`) ?? [];
      values.push(transaction);
      economicIdentityBlocks.set(`${prefix}|${key}`, values);
    }
  }

  for (const [key, values] of economicIdentityBlocks) {
    const transactions = uniqueTransactions(values);
    if (transactions.length < 2) continue;
    const [companyId, type] = key.split("|") as [string, NormalizedTransaction["type"]];
    blocks.push({ key, companyId, type, amountBucketIndex: -1, transactions });
  }

  return blocks;
}

function distinctiveTokenPairKeys(tokens: string[]): string[] {
  const keys: string[] = [];
  for (let left = 0; left < tokens.length; left += 1) {
    for (let right = left + 1; right < tokens.length; right += 1) {
      keys.push(`tokens:${tokens[left]}+${tokens[right]}`);
    }
  }
  return keys;
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const value = create();
  map.set(key, value);
  return value;
}

function uniqueTransactions(transactions: NormalizedTransaction[]): NormalizedTransaction[] {
  const seen = new Set<string>();
  const result: NormalizedTransaction[] = [];

  for (const transaction of transactions) {
    if (!seen.has(transaction.id)) {
      seen.add(transaction.id);
      result.push(transaction);
    }
  }

  return result;
}
