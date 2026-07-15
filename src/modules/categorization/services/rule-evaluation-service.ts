import type {
  CategorizationRuleRecord,
  JsonObject,
  RuleEvaluationResult,
  SuggestionCandidate,
  SuggestionOrigin,
  TransactionRecord,
} from "../domain/models";
import { normalizeText, normalizeTransaction } from "../domain/normalization";

interface RuleMatch {
  rule: CategorizationRuleRecord;
  matchedValue: string;
}

export class RuleEvaluationService {
  evaluate(transaction: TransactionRecord, rules: CategorizationRuleRecord[]): RuleEvaluationResult {
    const normalized = normalizeTransaction(transaction);
    const matches = rules
      .filter((rule) => rule.active && rule.companyId === transaction.companyId)
      .filter((rule) => this.matches(rule, normalized))
      .map((rule) => ({ rule, matchedValue: this.matchedValue(rule, normalized) }));

    const byCategory = new Map<string, RuleMatch[]>();
    for (const match of matches) {
      const categoryMatches = byCategory.get(match.rule.categoryId) ?? [];
      categoryMatches.push(match);
      byCategory.set(match.rule.categoryId, categoryMatches);
    }

    const candidates = [...byCategory.entries()]
      .map(([categoryId, categoryMatches]) => this.toCandidate(categoryId, categoryMatches))
      .sort((left, right) => right.priority - left.priority || right.score - left.score);

    return { candidates, hasConflict: candidates.length > 1 };
  }

  private matches(
    rule: CategorizationRuleRecord,
    normalized: ReturnType<typeof normalizeTransaction>,
  ): boolean {
    const value = this.stringCondition(rule.conditions, "value");
    const counterparty = this.stringCondition(rule.conditions, "counterparty");
    const min = this.numberCondition(rule.conditions, "min");
    const max = this.numberCondition(rule.conditions, "max");

    switch (rule.ruleType) {
      case "document_equals":
        return Boolean(normalized.document && value && normalized.document === value.replace(/\D/g, ""));
      case "counterparty_equals":
        return Boolean(normalized.counterparty && value && normalized.counterparty === normalizeText(value));
      case "counterparty_contains":
        return Boolean(normalized.counterparty && value && normalized.counterparty.includes(normalizeText(value)));
      case "description_equals":
        return Boolean(value && normalized.description === normalizeText(value));
      case "description_contains":
        return Boolean(value && normalized.description.includes(normalizeText(value)));
      case "amount_range":
        return this.inRange(normalized.absoluteAmount, min, max);
      case "counterparty_and_amount_range":
        return Boolean(
          normalized.counterparty &&
            counterparty &&
            normalized.counterparty === normalizeText(counterparty) &&
            this.inRange(normalized.absoluteAmount, min, max),
        );
    }
  }

  private matchedValue(
    rule: CategorizationRuleRecord,
    normalized: ReturnType<typeof normalizeTransaction>,
  ): string {
    switch (rule.ruleType) {
      case "document_equals":
        return normalized.document ?? "";
      case "counterparty_equals":
      case "counterparty_contains":
      case "counterparty_and_amount_range":
        return normalized.counterparty ?? "";
      case "description_equals":
      case "description_contains":
        return normalized.description;
      case "amount_range":
        return String(normalized.absoluteAmount);
    }
  }

  private toCandidate(categoryId: string, matches: RuleMatch[]): SuggestionCandidate {
    const ordered = [...matches].sort(
      (left, right) =>
        right.rule.priority - left.rule.priority || right.rule.confidence - left.rule.confidence,
    );
    const primary = ordered[0];
    if (!primary) throw new Error("A candidate requires at least one rule match");

    const corroborationBonus = Math.min(5, Math.max(0, ordered.length - 1) * 2);
    const score = Math.min(100, primary.rule.confidence + corroborationBonus);
    const evidence: JsonObject = {
      primaryRuleId: primary.rule.id,
      matchedValue: primary.matchedValue,
      corroborationBonus,
      matches: ordered.map(({ rule, matchedValue }) => ({
        ruleId: rule.id,
        ruleType: rule.ruleType,
        ruleVersion: rule.version,
        priority: rule.priority,
        confidence: rule.confidence,
        matchedValue,
      })),
    };

    return {
      categoryId,
      ruleId: primary.rule.id,
      score,
      origin: this.originFor(primary.rule),
      explanation: `Regra ${primary.rule.ruleType} correspondeu com prioridade ${primary.rule.priority}.`,
      evidence,
      priority: primary.rule.priority,
    };
  }

  private originFor(rule: CategorizationRuleRecord): SuggestionOrigin {
    if (rule.source === "manual") return "manual_rule";
    if (rule.source === "correction_history") return "correction_history";
    if (rule.ruleType === "document_equals") return "document_rule";
    if (rule.ruleType.startsWith("counterparty")) return "counterparty_rule";
    return "description_rule";
  }

  private stringCondition(conditions: JsonObject, key: string): string | null {
    const value = conditions[key];
    return typeof value === "string" && value.trim() ? value : null;
  }

  private numberCondition(conditions: JsonObject, key: string): number | null {
    const value = conditions[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private inRange(amount: number, min: number | null, max: number | null): boolean {
    if (min === null || max === null || min > max) return false;
    return amount >= min && amount <= max;
  }
}
