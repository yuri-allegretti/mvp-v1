import {
  DuplicateDecision,
  ImportSource,
  Prisma,
  PrismaClient,
  Role,
  TransactionType,
} from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  PendingAuthorizationError,
  decideDuplicateCandidate,
  detectPossibleDuplicates,
} from "../src/modules/duplicates";
import { listPendingItems } from "../src/modules/pending";

function databaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for pending tests");
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for pending tests");

  return line.replace("DATABASE_URL=", "").replace(/^"|"$/g, "");
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl(),
    },
  },
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface TestGraph {
  companyId: string;
  userId: string;
  bankAccountId: string;
}

async function cleanup(companyIds: string[], userIds: string[]) {
  await prisma.auditEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.pendingItem.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.duplicateCandidate.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.transaction.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.bankAccount.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.companyMembership.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

async function createGraph(role: Role = Role.accountant): Promise<TestGraph> {
  const suffix = crypto.randomUUID();
  const companyId = `pending-company-${suffix}`;
  const userId = `pending-user-${suffix}`;
  const bankAccountId = `pending-account-${suffix}`;

  await prisma.company.create({
    data: {
      id: companyId,
      name: `Pending Company ${suffix}`,
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@zelo.local`,
      passwordHash: "hash",
    },
  });
  await prisma.companyMembership.create({
    data: {
      companyId,
      userId,
      role,
    },
  });
  await prisma.bankAccount.create({
    data: {
      id: bankAccountId,
      companyId,
      bankName: "Itaú",
      accountNumberMasked: "****4321",
    },
  });

  return { companyId, userId, bankAccountId };
}

async function createTransaction(
  graph: TestGraph,
  overrides: {
    id?: string;
    date?: Date;
    amount?: string;
    type?: TransactionType;
    description?: string;
    counterpartyName?: string | null;
    documentNumber?: string | null;
    externalId?: string;
  } = {},
) {
  const id = overrides.id ?? `pending-tx-${crypto.randomUUID()}`;
  return prisma.transaction.create({
    data: {
      id,
      companyId: graph.companyId,
      bankAccountId: graph.bankAccountId,
      date: overrides.date ?? new Date("2026-07-01T00:00:00.000Z"),
      amount: new Prisma.Decimal(overrides.amount ?? "-150.00"),
      type: overrides.type ?? TransactionType.expense,
      description: overrides.description ?? "PIX FORNECEDOR ACME",
      source: ImportSource.itau_xlsx,
      sourceFileId: `source-${crypto.randomUUID()}`,
      externalId: overrides.externalId ?? `external-${crypto.randomUUID()}`,
      counterpartyName: overrides.counterpartyName ?? "Fornecedor ACME",
      documentNumber: overrides.documentNumber ?? "12345678000190",
    },
  });
}

async function createSimilarTransactions(graph: TestGraph) {
  const first = await createTransaction(graph, {
    description: "PIX FORNECEDOR ACME",
    counterpartyName: "Fornecedor ACME",
    documentNumber: "12345678000190",
    externalId: `external-a-${crypto.randomUUID()}`,
  });
  const second = await createTransaction(graph, {
    description: "Pix fornecedor acme",
    counterpartyName: "Fornecedor Acme",
    documentNumber: "12.345.678/0001-90",
    externalId: `external-b-${crypto.randomUUID()}`,
  });
  return { first, second };
}

async function createPending(graph: TestGraph, overrides: Partial<{
  status: "open" | "in_review" | "resolved" | "dismissed";
  deduplicationKey: string;
  type: string;
}> = {}) {
  return prisma.pendingItem.create({
    data: {
      companyId: graph.companyId,
      type: overrides.type ?? "categorization_review",
      status: overrides.status ?? "open",
      severity: "medium",
      deduplicationKey: overrides.deduplicationKey ?? `pending-${crypto.randomUUID()}`,
      title: "Revisar pendência",
      description: "Pendência de teste",
      metadata: {},
    },
  });
}

describe("unified pending items and duplicate candidates", () => {
  it("lists open pending items by company", async () => {
    const graph = await createGraph();
    try {
      const pending = await createPending(graph);
      await createPending(graph, { status: "resolved" });

      const items = await listPendingItems({ companyId: graph.companyId }, prisma);

      expect(items.map((item) => item.id)).toEqual([pending.id]);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("does not list pending items from another company", async () => {
    const first = await createGraph();
    const second = await createGraph();
    try {
      const firstPending = await createPending(first);
      await createPending(second);

      const items = await listPendingItems({ companyId: first.companyId }, prisma);

      expect(items.map((item) => item.id)).toEqual([firstPending.id]);
      expect(items.every((item) => item.companyId === first.companyId)).toBe(true);
    } finally {
      await cleanup(
        [first.companyId, second.companyId],
        [first.userId, second.userId],
      );
    }
  });

  it("partial index blocks two open pending items with the same deduplicationKey", async () => {
    const graph = await createGraph();
    try {
      const deduplicationKey = `pending-dedup-${crypto.randomUUID()}`;
      await createPending(graph, { deduplicationKey });

      await expect(createPending(graph, { deduplicationKey })).rejects.toMatchObject({
        code: "P2002",
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("partial index allows a new pending item when the previous one is resolved or dismissed", async () => {
    const graph = await createGraph();
    try {
      const deduplicationKey = `pending-reopen-${crypto.randomUUID()}`;
      await createPending(graph, { deduplicationKey, status: "resolved" });
      await createPending(graph, { deduplicationKey, status: "dismissed" });

      await expect(createPending(graph, { deduplicationKey })).resolves.toMatchObject({
        status: "open",
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("creates DuplicateCandidate and possible_duplicate pending for similar transactions", async () => {
    const graph = await createGraph();
    try {
      await createSimilarTransactions(graph);

      const result = await detectPossibleDuplicates({ companyId: graph.companyId }, prisma);

      expect(result.candidatesCreated).toBe(1);
      expect(result.pendingCreated).toBe(1);
      expect(result.candidates[0]).toMatchObject({
        companyId: graph.companyId,
        score: expect.any(Number),
      });
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: { companyId: graph.companyId, type: "possible_duplicate" },
        }),
      ).resolves.toMatchObject({
        status: "open",
        duplicateCandidateId: result.candidates[0]?.id,
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("does not create DuplicateCandidate for clearly different transactions", async () => {
    const graph = await createGraph();
    try {
      await createTransaction(graph, {
        date: new Date("2026-07-01T00:00:00.000Z"),
        amount: "-150.00",
        description: "PIX FORNECEDOR ACME",
      });
      await createTransaction(graph, {
        date: new Date("2026-07-15T00:00:00.000Z"),
        amount: "-999.00",
        description: "COMPRA SOFTWARE CLOUD",
        counterpartyName: "Cloud Vendor",
        documentNumber: null,
      });

      const result = await detectPossibleDuplicates({ companyId: graph.companyId }, prisma);

      expect(result.candidatesCreated).toBe(0);
      expect(result.pendingCreated).toBe(0);
      await expect(
        prisma.duplicateCandidate.count({ where: { companyId: graph.companyId } }),
      ).resolves.toBe(0);
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("does not create cross-company duplicate candidates", async () => {
    const first = await createGraph();
    const second = await createGraph();
    try {
      await createTransaction(first, {
        description: "PIX FORNECEDOR ACME",
        counterpartyName: "Fornecedor ACME",
        documentNumber: "12345678000190",
      });
      await createTransaction(second, {
        description: "PIX FORNECEDOR ACME",
        counterpartyName: "Fornecedor ACME",
        documentNumber: "12345678000190",
      });

      const firstResult = await detectPossibleDuplicates({ companyId: first.companyId }, prisma);
      const secondResult = await detectPossibleDuplicates({ companyId: second.companyId }, prisma);

      expect(firstResult.candidatesCreated).toBe(0);
      expect(secondResult.candidatesCreated).toBe(0);
    } finally {
      await cleanup(
        [first.companyId, second.companyId],
        [first.userId, second.userId],
      );
    }
  });

  it.each([
    DuplicateDecision.duplicate_confirmed,
    DuplicateDecision.not_duplicate,
    DuplicateDecision.allowed_exception,
  ])("decision %s updates candidate, resolves pending and audits", async (decision) => {
    const role =
      decision === DuplicateDecision.not_duplicate ? Role.admin : Role.accountant;
    const graph = await createGraph(role);
    try {
      await createSimilarTransactions(graph);
      const detection = await detectPossibleDuplicates({ companyId: graph.companyId }, prisma);
      const candidate = detection.candidates[0];
      if (!candidate) throw new Error("Expected duplicate candidate");

      const decided = await decideDuplicateCandidate(
        {
          companyId: graph.companyId,
          duplicateCandidateId: candidate.id,
          actorUserId: graph.userId,
          decision,
          reason: `decision ${decision}`,
        },
        prisma,
      );

      expect(decided).toMatchObject({
        id: candidate.id,
        companyId: graph.companyId,
        decision,
        decidedByUserId: graph.userId,
      });
      await expect(
        prisma.pendingItem.findFirstOrThrow({
          where: {
            companyId: graph.companyId,
            duplicateCandidateId: candidate.id,
          },
        }),
      ).resolves.toMatchObject({
        status: "resolved",
        resolvedByUserId: graph.userId,
      });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: {
            companyId: graph.companyId,
            entityType: "DuplicateCandidate",
            entityId: candidate.id,
          },
        }),
      ).resolves.toMatchObject({
        action: "duplicate.decision",
        actorUserId: graph.userId,
      });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });

  it("viewer cannot decide duplicate pending items", async () => {
    const graph = await createGraph(Role.viewer);
    try {
      await createSimilarTransactions(graph);
      const detection = await detectPossibleDuplicates({ companyId: graph.companyId }, prisma);
      const candidate = detection.candidates[0];
      if (!candidate) throw new Error("Expected duplicate candidate");

      await expect(
        decideDuplicateCandidate(
          {
            companyId: graph.companyId,
            duplicateCandidateId: candidate.id,
            actorUserId: graph.userId,
            decision: DuplicateDecision.duplicate_confirmed,
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(PendingAuthorizationError);

      await expect(
        prisma.duplicateCandidate.findUniqueOrThrow({
          where: {
            id_companyId: {
              id: candidate.id,
              companyId: graph.companyId,
            },
          },
        }),
      ).resolves.toMatchObject({ decision: null });
    } finally {
      await cleanup([graph.companyId], [graph.userId]);
    }
  });
});
