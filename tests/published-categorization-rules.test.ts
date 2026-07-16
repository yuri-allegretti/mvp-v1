import { describe, expect, it } from "vitest";
import {
  confidenceForPublishedRule,
  publishedBroadCategorizationRules,
} from "../scripts/support/published-categorization-rules";
import type { CategorizationRuleRecord, TransactionRecord } from "../src/modules/categorization/domain/models";
import { RuleEvaluationService } from "../src/modules/categorization/services/rule-evaluation-service";

function transaction(description: string, companyId = "company-1"): TransactionRecord {
  return {
    id: "transaction-1",
    companyId,
    bankAccountId: "account-1",
    date: new Date("2026-01-10T00:00:00.000Z"),
    description,
    amount: 1000,
    type: "income",
    externalId: "external-1",
    counterpartyName: null,
    documentNumber: null,
    categoryId: null,
    updatedAt: new Date("2026-01-10T00:00:00.000Z"),
  };
}

function rulesFor(pattern: string, companyId = "company-1"): CategorizationRuleRecord[] {
  return publishedBroadCategorizationRules
    .filter((rule) => rule.pattern === pattern)
    .map((rule, index) => ({
      id: `rule-${index}`,
      companyId,
      categoryId: rule.categoryId,
      ruleType: "description_contains",
      conditions: { value: rule.pattern },
      priority: 900 - index,
      confidence: confidenceForPublishedRule(rule.behavior),
      active: true,
      source: "manual",
      createdFromAuditEventId: null,
      version: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }));
}

describe("published categorization rule seed", () => {
  it("contains 56 reusable semantic rules without transaction-specific identifiers", () => {
    expect(publishedBroadCategorizationRules).toHaveLength(56);
    expect(
      new Set(
        publishedBroadCategorizationRules.map(
          (rule) => `${rule.pattern}|${rule.categoryId}`,
        ),
      ).size,
    ).toBe(56);
    expect(
      publishedBroadCategorizationRules.some((rule) =>
        /(?:TX-COMPANY|\b(?:CP|ISO|SYN)-?\d+\b)/i.test(rule.pattern),
      ),
    ).toBe(false);
    expect(
      Object.fromEntries(
        ["auto_apply", "review", "conflict", "low_confidence"].map((behavior) => [
          behavior,
          publishedBroadCategorizationRules.filter((rule) => rule.behavior === behavior)
            .length,
        ]),
      ),
    ).toEqual({ auto_apply: 23, review: 30, conflict: 2, low_confidence: 1 });
  });

  it("matches a recurring semantic family and preserves company scope", () => {
    const evaluator = new RuleEvaluationService();
    const scopedRules = rulesFor("REPASSE CANAL PEDIDOS");

    expect(
      evaluator.evaluate(
        transaction("PIX RECEB REPASSE CANAL PEDIDOS PRISMA ENTREGAS"),
        scopedRules,
      ),
    ).toMatchObject({
      hasConflict: false,
      candidates: [{ categoryId: "cat-income-sales", score: 95 }],
    });
    expect(
      evaluator.evaluate(
        transaction("PIX RECEB REPASSE CANAL PEDIDOS", "company-2"),
        scopedRules,
      ).candidates,
    ).toEqual([]);
  });

  it("keeps the published software-versus-marketing conflict actionable", () => {
    const result = new RuleEvaluationService().evaluate(
      transaction("DEB AUTO SUPORTE PLATAFORMA CRIACAO NEBULA GRID"),
      rulesFor("SUPORTE PLATAFORMA CRIACAO"),
    );

    expect(result.hasConflict).toBe(true);
    expect(result.candidates.map((candidate) => candidate.categoryId).sort()).toEqual([
      "cat-expense-marketing",
      "cat-expense-software",
    ]);
  });
});
