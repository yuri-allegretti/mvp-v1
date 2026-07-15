import type {
  CategorizationSuggestionStatus,
  PendingStatus,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { createCategorizationServices } from "./categorization-workflow";

const actionablePendingStatuses: PendingStatus[] = ["open", "in_review"];

export class CategorizationReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategorizationReviewError";
  }
}

export interface ListCategorizationSuggestionsInput {
  companyId: string;
  status?: CategorizationSuggestionStatus[];
  transactionId?: string;
  pendingOnly?: boolean;
}

async function requireSuggestion(
  client: PrismaClient,
  companyId: string,
  suggestionId: string,
) {
  const suggestion = await client.categorizationSuggestion.findUnique({
    where: {
      id_companyId: {
        id: suggestionId,
        companyId,
      },
    },
    select: {
      id: true,
      transactionId: true,
    },
  });

  if (!suggestion) {
    throw new CategorizationReviewError("Categorization suggestion not found for company");
  }

  return suggestion;
}

export async function listCategorizationSuggestions(
  input: ListCategorizationSuggestionsInput,
  client: PrismaClient = prisma,
) {
  return client.categorizationSuggestion.findMany({
    where: {
      companyId: input.companyId,
      ...(input.status ? { status: { in: input.status } } : {}),
      ...(input.transactionId ? { transactionId: input.transactionId } : {}),
      ...(input.pendingOnly
        ? {
            pendingItems: {
              some: {
                companyId: input.companyId,
                status: { in: actionablePendingStatuses },
              },
            },
          }
        : {}),
    },
    include: {
      transaction: true,
      suggestedCategory: {
        select: { id: true, name: true, isActive: true },
      },
      rule: {
        select: { id: true, ruleType: true, source: true, status: true },
      },
      pendingItems: {
        where: {
          companyId: input.companyId,
          status: { in: actionablePendingStatuses },
        },
        orderBy: [{ createdAt: "asc" }],
      },
      auditEvents: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function listActiveCategoriesForCompany(
  companyId: string,
  client: PrismaClient = prisma,
) {
  return client.category.findMany({
    where: {
      companyId,
      isActive: true,
    },
    orderBy: [{ name: "asc" }],
  });
}

export async function acceptCategorizationSuggestion(
  input: {
    companyId: string;
    suggestionId: string;
    actorUserId: string;
    reason?: string;
  },
  client: PrismaClient = prisma,
) {
  const suggestion = await requireSuggestion(client, input.companyId, input.suggestionId);
  const services = createCategorizationServices(client);
  return services.decisionService.acceptSuggestion({
    companyId: input.companyId,
    transactionId: suggestion.transactionId,
    suggestionId: suggestion.id,
    actorUserId: input.actorUserId,
    reason: input.reason,
  });
}

export async function rejectCategorizationSuggestion(
  input: {
    companyId: string;
    suggestionId: string;
    actorUserId: string;
    reason: string;
  },
  client: PrismaClient = prisma,
) {
  const suggestion = await requireSuggestion(client, input.companyId, input.suggestionId);
  const services = createCategorizationServices(client);
  return services.decisionService.rejectSuggestion({
    companyId: input.companyId,
    transactionId: suggestion.transactionId,
    suggestionId: suggestion.id,
    actorUserId: input.actorUserId,
    reason: input.reason,
  });
}

export async function correctCategorizationSuggestion(
  input: {
    companyId: string;
    suggestionId: string;
    actorUserId: string;
    categoryId: string;
    reason: string;
  },
  client: PrismaClient = prisma,
) {
  const suggestion = await requireSuggestion(client, input.companyId, input.suggestionId);
  const services = createCategorizationServices(client);
  return services.decisionService.correctCategory({
    companyId: input.companyId,
    transactionId: suggestion.transactionId,
    suggestionId: suggestion.id,
    finalCategoryId: input.categoryId,
    actorUserId: input.actorUserId,
    reason: input.reason,
  });
}

export async function markTransactionCategorizationUndefined(
  input: {
    companyId: string;
    transactionId: string;
    actorUserId: string;
    reason: string;
    suggestionId?: string;
  },
  client: PrismaClient = prisma,
) {
  const services = createCategorizationServices(client);
  return services.decisionService.markUndefined({
    companyId: input.companyId,
    transactionId: input.transactionId,
    suggestionId: input.suggestionId,
    actorUserId: input.actorUserId,
    reason: input.reason,
  });
}
