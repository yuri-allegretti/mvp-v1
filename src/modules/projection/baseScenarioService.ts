import type { BaseScenario, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export class BaseScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseScenarioError";
  }
}

export async function ensureBaseScenario(
  companyId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<BaseScenario> {
  const company = await client.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });

  if (!company) {
    throw new BaseScenarioError("Company not found");
  }

  return client.baseScenario.upsert({
    where: { companyId },
    update: {
      name: "Base",
    },
    create: {
      companyId,
      name: "Base",
    },
  });
}
