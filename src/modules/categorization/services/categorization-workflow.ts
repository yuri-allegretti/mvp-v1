import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { AuditService } from "./audit-service.js";
import { CategorizationDecisionService } from "./categorization-decision-service.js";
import {
  CategorizationEngine,
  type CategorizationEngineResult,
} from "./categorization-engine.js";
import { PendingGenerationService } from "./pending-generation-service.js";
import { RuleEvaluationService } from "./rule-evaluation-service.js";
import { PrismaCategorizationStore } from "../stores/prismaCategorizationStore.js";

export interface CategorizationServices {
  store: PrismaCategorizationStore;
  auditService: AuditService;
  decisionService: CategorizationDecisionService;
  pendingService: PendingGenerationService;
  ruleEvaluationService: RuleEvaluationService;
  engine: CategorizationEngine;
}

export function createCategorizationServices(
  client: PrismaClient = prisma,
): CategorizationServices {
  const store = new PrismaCategorizationStore(client);
  const auditService = new AuditService(store);
  const decisionService = new CategorizationDecisionService(store, auditService);
  const pendingService = new PendingGenerationService(store, auditService);
  const ruleEvaluationService = new RuleEvaluationService();
  const engine = new CategorizationEngine(
    store,
    ruleEvaluationService,
    decisionService,
    pendingService,
  );

  return {
    store,
    auditService,
    decisionService,
    pendingService,
    ruleEvaluationService,
    engine,
  };
}

export interface CategorizeTransactionsInput {
  companyId: string;
  transactionIds: string[];
}

export interface CategorizeImportedTransactionsInput {
  companyId: string;
  bankImportId: string;
}

export interface CategorizationBatchResult {
  processed: number;
  automaticallyApplied: number;
  pending: number;
  alreadyCategorized: number;
  results: CategorizationEngineResult[];
}

function summarize(results: CategorizationEngineResult[]): CategorizationBatchResult {
  return {
    processed: results.length,
    automaticallyApplied: results.filter(
      (result) => result.outcome === "automatically_applied",
    ).length,
    pending: results.filter((result) => result.outcome === "pending").length,
    alreadyCategorized: results.filter((result) => result.outcome === "already_categorized")
      .length,
    results,
  };
}

export async function categorizeTransactions(
  input: CategorizeTransactionsInput,
  client: PrismaClient = prisma,
): Promise<CategorizationBatchResult> {
  const services = createCategorizationServices(client);
  const results: CategorizationEngineResult[] = [];

  for (const transactionId of input.transactionIds) {
    results.push(await services.engine.process(input.companyId, transactionId));
  }

  return summarize(results);
}

export async function categorizeImportedTransactions(
  input: CategorizeImportedTransactionsInput,
  client: PrismaClient = prisma,
): Promise<CategorizationBatchResult> {
  const rows = await client.importedTransactionRaw.findMany({
    where: {
      companyId: input.companyId,
      bankImportId: input.bankImportId,
      status: "imported",
      transactionId: { not: null },
    },
    select: { transactionId: true },
    orderBy: { createdAt: "asc" },
  });

  return categorizeTransactions(
    {
      companyId: input.companyId,
      transactionIds: rows
        .map((row) => row.transactionId)
        .filter((transactionId): transactionId is string => transactionId !== null),
    },
    client,
  );
}
