import { Prisma, type PrismaClient, type ProjectedCashflowItem } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { addMonthsClamped, formatIsoDate, parseIsoDate } from "../recurrences/core/utils/dateUtils.ts";
import {
  RecurrenceApprovalError,
  requireRecurrenceManagementPermission,
} from "../recurrences/services/recurrenceApprovalService";
import { ensureBaseScenario } from "./baseScenarioService";

const allowedHorizons = [30, 60, 90] as const;

export class ProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectionError";
  }
}

export interface GenerateProjectionInput {
  companyId: string;
  actorUserId: string;
  horizonDays: (typeof allowedHorizons)[number];
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return startOfUtcDay(next);
}

function addFrequency(date: Date, frequency: string): Date | null {
  const isoDate = formatIsoDate(date);
  switch (frequency) {
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "monthly":
      return parseIsoDate(addMonthsClamped(isoDate, 1));
    case "yearly":
      return parseIsoDate(addMonthsClamped(isoDate, 12));
    case "unknown":
      return null;
    default:
      return null;
  }
}

function computeProjectionDates(params: {
  nextDate: Date | null;
  startDate: Date;
  endDate: Date | null;
  installmentCount: number | null;
  observedOccurrences: number;
  frequency: string;
  horizonDays: number;
}): Date[] {
  const today = startOfUtcDay(new Date());
  const horizonEnd = addDays(today, params.horizonDays);
  const firstDate = startOfUtcDay(params.nextDate ?? params.startDate);
  const endDate = params.endDate ? startOfUtcDay(params.endDate) : null;
  const remainingInstallments =
    params.installmentCount === null
      ? null
      : Math.max(params.installmentCount - params.observedOccurrences, 0);

  const dates: Date[] = [];
  let cursor = firstDate;
  let projectedCount = 0;

  while (cursor < today) {
    const nextCursor = addFrequency(cursor, params.frequency);
    if (!nextCursor) {
      return dates;
    }
    cursor = nextCursor;
    projectedCount += 1;
    if (remainingInstallments !== null && projectedCount >= remainingInstallments) {
      return dates;
    }
  }

  for (;;) {
    if (cursor > horizonEnd) break;
    if (endDate && cursor > endDate) break;
    if (remainingInstallments !== null && dates.length >= remainingInstallments) break;

    dates.push(cursor);

    const nextCursor = addFrequency(cursor, params.frequency);
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return dates;
}

export async function generateProjection(
  input: GenerateProjectionInput,
  client: PrismaClient = prisma,
): Promise<ProjectedCashflowItem[]> {
  if (!allowedHorizons.includes(input.horizonDays)) {
    throw new ProjectionError("Projection horizon must be 30, 60 or 90 days");
  }

  await requireRecurrenceManagementPermission(client, input.companyId, input.actorUserId);

  return client.$transaction(async (tx) => {
    const baseScenario = await ensureBaseScenario(input.companyId, tx);
    if (baseScenario.companyId !== input.companyId) {
      throw new ProjectionError("Base scenario does not belong to company");
    }

    const recurrences = await tx.approvedRecurrence.findMany({
      where: {
        companyId: input.companyId,
        status: "active",
      },
      include: {
        recurrenceSuggestion: {
          select: {
            id: true,
            transactions: {
              select: { id: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const itemsToCreate = recurrences.flatMap((recurrence) => {
      const observedOccurrences = recurrence.recurrenceSuggestion?.transactions.length ?? 0;
      const dates = computeProjectionDates({
        nextDate: recurrence.nextDate,
        startDate: recurrence.startDate,
        endDate: recurrence.endDate,
        installmentCount: recurrence.installmentCount,
        observedOccurrences,
        frequency: recurrence.frequency,
        horizonDays: input.horizonDays,
      });

      return dates.map((date) => ({
        companyId: input.companyId,
        baseScenarioId: baseScenario.id,
        approvedRecurrenceId: recurrence.id,
        date,
        amount: recurrence.estimatedAmount,
        type: recurrence.type,
        description: recurrence.description,
        horizonDays: input.horizonDays,
      }));
    });

    await tx.projectedCashflowItem.deleteMany({
      where: {
        companyId: input.companyId,
        baseScenarioId: baseScenario.id,
        horizonDays: input.horizonDays,
      },
    });

    if (itemsToCreate.length > 0) {
      await tx.projectedCashflowItem.createMany({
        data: itemsToCreate.map((item) => ({
          ...item,
          amount:
            item.amount instanceof Prisma.Decimal ? item.amount : new Prisma.Decimal(item.amount),
        })),
      });
    }

    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        entityType: "BaseScenario",
        entityId: baseScenario.id,
        action: "projection.generated",
        metadata: {
          baseScenarioId: baseScenario.id,
          horizonDays: input.horizonDays,
          approvedRecurrenceCount: recurrences.length,
          projectedItemCount: itemsToCreate.length,
        },
      },
    });

    return tx.projectedCashflowItem.findMany({
      where: {
        companyId: input.companyId,
        baseScenarioId: baseScenario.id,
        horizonDays: input.horizonDays,
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
  });
}
