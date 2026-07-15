import { describe, expect, it } from "vitest";
import type { RecurrenceSuggestion } from "../src/modules/recurrences/core/types.ts";
import {
  buildLogicalRecurrenceSuggestionCollisionKey,
  buildLogicalRecurrenceSuggestionKey,
  consolidateCoreRecurrenceSuggestions,
  type RecurrenceTransactionIdentity,
} from "../src/modules/recurrences/services/recurrenceSuggestionConsolidation";

function suggestion(overrides: Partial<RecurrenceSuggestion> & Pick<RecurrenceSuggestion, "id" | "transactionIds">): RecurrenceSuggestion {
  return {
    id: overrides.id,
    companyId: overrides.companyId ?? "company-1",
    type: overrides.type ?? "expense",
    representativeDescription: overrides.representativeDescription ?? "SERVICO ACME",
    normalizedDescription: overrides.normalizedDescription ?? "servico acme",
    transactionIds: overrides.transactionIds,
    frequency: overrides.frequency ?? "monthly",
    recurrenceType: overrides.recurrenceType ?? "fixed",
    patternKind: overrides.patternKind ?? "monthly_fixed",
    averageAmount: overrides.averageAmount ?? -100,
    estimatedNextAmount: overrides.estimatedNextAmount ?? -100,
    amountVariationPercent: overrides.amountVariationPercent ?? 0,
    expectedNextDate: overrides.expectedNextDate ?? "2026-06-05",
    confidenceScore: overrides.confidenceScore ?? 85,
    status: "pending",
    startDate: overrides.startDate ?? "2026-01-05",
    evidence: overrides.evidence ?? {
      textSimilarityScore: 90,
      periodicityScore: 90,
      amountStabilityScore: 90,
      categoryScore: 0,
      occurrenceScore: 80,
      reasons: [],
    },
    ...(overrides.categoryId ? { categoryId: overrides.categoryId } : {}),
    ...(overrides.endDate ? { endDate: overrides.endDate } : {}),
    ...(overrides.installmentCount ? { installmentCount: overrides.installmentCount } : {}),
  };
}

function transactions(ids: string[]): Map<string, RecurrenceTransactionIdentity> {
  return new Map(
    ids.map((id, index) => [
      id,
      { id, bankAccountId: "account-1", date: `2026-${String(index + 1).padStart(2, "0")}-05` },
    ]),
  );
}

describe("recurrence suggestion consolidation", () => {
  it("keeps the most complete highly-overlapping suggestion", () => {
    const transactionMap = transactions(["t1", "t2", "t3", "t4", "t5"]);
    const result = consolidateCoreRecurrenceSuggestions(
      [
        suggestion({ id: "partial", transactionIds: ["t1", "t2", "t3", "t4"], confidenceScore: 92 }),
        suggestion({ id: "complete", transactionIds: ["t1", "t2", "t3", "t4", "t5"], confidenceScore: 88 }),
      ],
      transactionMap,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("complete");
  });

  it("does not collapse disjoint recurrences from the same supplier", () => {
    const transactionMap = transactions(["a1", "a2", "a3", "b1", "b2", "b3"]);
    const result = consolidateCoreRecurrenceSuggestions(
      [
        suggestion({ id: "contract-a", transactionIds: ["a1", "a2", "a3"], averageAmount: -100 }),
        suggestion({ id: "contract-b", transactionIds: ["b1", "b2", "b3"], averageAmount: -500 }),
      ],
      transactionMap,
    );

    expect(result).toHaveLength(2);
  });

  it("does not collapse installment and continuous monthly recurrence", () => {
    const transactionMap = transactions(["t1", "t2", "t3", "t4"]);
    const result = consolidateCoreRecurrenceSuggestions(
      [
        suggestion({ id: "monthly", transactionIds: ["t1", "t2", "t3", "t4"] }),
        suggestion({
          id: "installment",
          transactionIds: ["t1", "t2", "t3", "t4"],
          patternKind: "installment",
          installmentCount: 12,
        }),
      ],
      transactionMap,
    );

    expect(result).toHaveLength(2);
  });

  it("keeps the logical key stable when later transactions are added", () => {
    const transactionMap = transactions(["t1", "t2", "t3", "t4"]);
    const first = suggestion({ id: "first", transactionIds: ["t1", "t2", "t3"] });
    const expanded = suggestion({ id: "expanded", transactionIds: ["t1", "t2", "t3", "t4"] });

    expect(buildLogicalRecurrenceSuggestionKey(first, transactionMap)).toBe(
      buildLogicalRecurrenceSuggestionKey(expanded, transactionMap),
    );
  });

  it("builds a deterministic discriminator when a logical base key is occupied", () => {
    const logicalKey = "recurrence:v2:base";

    expect(buildLogicalRecurrenceSuggestionCollisionKey(logicalKey, "detector-a")).toBe(
      buildLogicalRecurrenceSuggestionCollisionKey(logicalKey, "detector-a"),
    );
    expect(buildLogicalRecurrenceSuggestionCollisionKey(logicalKey, "detector-a")).not.toBe(
      buildLogicalRecurrenceSuggestionCollisionKey(logicalKey, "detector-b"),
    );
  });
});
