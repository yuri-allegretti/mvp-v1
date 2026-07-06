import {
  DuplicateDecision,
  type DuplicateCandidate,
  type Prisma,
  type PrismaClient,
  type Transaction,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import {
  PendingAuthorizationError,
  PendingStateError,
  requirePendingDecisionPermission,
} from "../pending";

const possibleDuplicateType = "possible_duplicate";
const duplicateThreshold = 80;
const actionablePendingStatuses = ["open", "in_review"] as const;

export interface DetectPossibleDuplicatesInput {
  companyId: string;
  bankAccountId?: string;
  transactionIds?: string[];
}

export interface DuplicateDetectionResult {
  candidatesCreated: number;
  pendingCreated: number;
  candidates: DuplicateCandidate[];
}

export interface DecideDuplicateCandidateInput {
  companyId: string;
  duplicateCandidateId: string;
  actorUserId: string;
  decision: DuplicateDecision;
  reason?: string;
}

interface ScoredPair {
  first: Transaction;
  second: Transaction;
  score: number;
  evidence: Prisma.InputJsonObject;
}

function normalize(value: string | null): string {
  if (!value) return "";
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameDate(left: Date, right: Date): boolean {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

function amountNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

function scorePair(first: Transaction, second: Transaction): ScoredPair | null {
  if (first.id === second.id) return null;
  if (first.companyId !== second.companyId) return null;
  if (first.bankAccountId !== second.bankAccountId) return null;
  if (first.externalId && first.externalId === second.externalId) return null;

  const checks = {
    sameBankAccount: first.bankAccountId === second.bankAccountId,
    sameDate: sameDate(first.date, second.date),
    sameAmount: amountNumber(first.amount) === amountNumber(second.amount),
    sameType: first.type === second.type,
    sameDescription:
      normalize(first.description) !== "" &&
      normalize(first.description) === normalize(second.description),
    sameCounterparty:
      normalize(first.counterpartyName) !== "" &&
      normalize(first.counterpartyName) === normalize(second.counterpartyName),
    sameDocument:
      normalize(first.documentNumber) !== "" &&
      normalize(first.documentNumber) === normalize(second.documentNumber),
    differentExternalId: first.externalId !== second.externalId,
  };

  if (!checks.sameDate || !checks.sameAmount || !checks.sameType) return null;

  let score = 0;
  if (checks.sameBankAccount) score += 15;
  if (checks.sameDate) score += 20;
  if (checks.sameAmount) score += 20;
  if (checks.sameType) score += 10;
  if (checks.sameDescription) score += 20;
  if (checks.sameCounterparty) score += 10;
  if (checks.sameDocument) score += 15;

  if (!checks.sameDescription && !checks.sameCounterparty && !checks.sameDocument) {
    return null;
  }

  if (score < duplicateThreshold) return null;

  return {
    first,
    second,
    score: Math.min(score, 100),
    evidence: {
      checks,
      firstExternalId: first.externalId,
      secondExternalId: second.externalId,
      normalizedDescription: normalize(first.description),
      normalizedCounterparty: normalize(first.counterpartyName),
      normalizedDocument: normalize(first.documentNumber),
    },
  };
}

function orderedPair(left: Transaction, right: Transaction): [Transaction, Transaction] {
  return left.id.localeCompare(right.id) <= 0 ? [left, right] : [right, left];
}

async function ensurePendingForCandidate(
  tx: Prisma.TransactionClient,
  candidate: DuplicateCandidate,
): Promise<boolean> {
  const deduplicationKey = [
    candidate.companyId,
    possibleDuplicateType,
    candidate.transactionId,
    candidate.candidateTransactionId,
  ].join(":");

  const existing = await tx.pendingItem.findFirst({
    where: {
      companyId: candidate.companyId,
      duplicateCandidateId: candidate.id,
      deduplicationKey,
      status: { in: [...actionablePendingStatuses] },
    },
  });
  if (existing) return false;

  await tx.pendingItem.create({
    data: {
      companyId: candidate.companyId,
      type: possibleDuplicateType,
      severity: candidate.score >= 90 ? "high" : "medium",
      duplicateCandidateId: candidate.id,
      deduplicationKey,
      title: "Revisar possível duplicidade",
      description: "Duas transações parecem representar o mesmo lançamento.",
      metadata: {
        score: candidate.score,
        transactionId: candidate.transactionId,
        candidateTransactionId: candidate.candidateTransactionId,
      },
    },
  });
  return true;
}

export async function detectPossibleDuplicates(
  input: DetectPossibleDuplicatesInput,
  client: PrismaClient = prisma,
): Promise<DuplicateDetectionResult> {
  const transactions = await client.transaction.findMany({
    where: {
      companyId: input.companyId,
      ...(input.bankAccountId ? { bankAccountId: input.bankAccountId } : {}),
      ...(input.transactionIds ? { id: { in: input.transactionIds } } : {}),
    },
    orderBy: [{ bankAccountId: "asc" }, { date: "asc" }, { amount: "asc" }],
  });

  const candidates: DuplicateCandidate[] = [];
  let candidatesCreated = 0;
  let pendingCreated = 0;

  await client.$transaction(async (tx) => {
    for (let i = 0; i < transactions.length; i += 1) {
      for (let j = i + 1; j < transactions.length; j += 1) {
        const pair = scorePair(transactions[i]!, transactions[j]!);
        if (!pair) continue;

        const [first, second] = orderedPair(pair.first, pair.second);
        const existing = await tx.duplicateCandidate.findUnique({
          where: {
            companyId_transactionId_candidateTransactionId: {
              companyId: input.companyId,
              transactionId: first.id,
              candidateTransactionId: second.id,
            },
          },
        });
        const candidate =
          existing ??
          (await tx.duplicateCandidate.create({
            data: {
              companyId: input.companyId,
              transactionId: first.id,
              candidateTransactionId: second.id,
              score: pair.score,
              evidence: pair.evidence,
            },
          }));

        candidates.push(candidate);
        if (!existing) candidatesCreated += 1;
        if (await ensurePendingForCandidate(tx, candidate)) pendingCreated += 1;
      }
    }
  });

  return {
    candidatesCreated,
    pendingCreated,
    candidates,
  };
}

export async function decideDuplicateCandidate(
  input: DecideDuplicateCandidateInput,
  client: PrismaClient = prisma,
): Promise<DuplicateCandidate> {
  await requirePendingDecisionPermission(client, input.companyId, input.actorUserId);

  return client.$transaction(async (tx) => {
    const candidate = await tx.duplicateCandidate.findUnique({
      where: {
        id_companyId: {
          id: input.duplicateCandidateId,
          companyId: input.companyId,
        },
      },
    });

    if (!candidate) throw new PendingStateError("Duplicate candidate not found for company");
    if (candidate.decision) {
      throw new PendingStateError("Duplicate candidate was already decided");
    }

    const pendingItems = await tx.pendingItem.findMany({
      where: {
        companyId: input.companyId,
        duplicateCandidateId: candidate.id,
        type: possibleDuplicateType,
        status: { in: [...actionablePendingStatuses] },
      },
    });

    const updated = await tx.duplicateCandidate.update({
      where: {
        id_companyId: {
          id: input.duplicateCandidateId,
          companyId: input.companyId,
        },
      },
      data: {
        decision: input.decision,
        decidedByUserId: input.actorUserId,
        decidedAt: new Date(),
      },
    });

    if (pendingItems.length > 0) {
      await tx.pendingItem.updateMany({
        where: {
          id: { in: pendingItems.map((item) => item.id) },
          companyId: input.companyId,
          status: { in: [...actionablePendingStatuses] },
        },
        data: {
          status: "resolved",
          resolvedAt: new Date(),
          resolvedByUserId: input.actorUserId,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        entityType: "DuplicateCandidate",
        entityId: candidate.id,
        action: "duplicate.decision",
        transactionId: candidate.transactionId,
        reason: input.reason ?? null,
        metadata: {
          decision: input.decision,
          candidateTransactionId: candidate.candidateTransactionId,
          score: candidate.score,
          pendingItemIds: pendingItems.map((item) => item.id),
        },
      },
    });

    return updated;
  });
}

export { DuplicateDecision, PendingAuthorizationError, PendingStateError };
