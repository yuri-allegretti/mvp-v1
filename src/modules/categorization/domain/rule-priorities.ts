import type { RuleSource, RuleType } from "./models.js";

/**
 * Defaults used when rules are created. Evaluation always uses the persisted
 * numeric priority, making overrides explicit and audit-friendly.
 */
export const DEFAULT_RULE_PRIORITIES = {
  manual_rule: 1_000,
  document_equals: 900,
  counterparty_equals: 800,
  description_equals: 700,
  counterparty_contains: 600,
  counterparty_and_amount_range: 500,
  amount_range: 450,
  description_contains: 400,
  correction_history: 300,
  recurrence_context: 200,
  fallback: 100,
} as const;

export function defaultPriorityFor(source: RuleSource, ruleType: RuleType): number {
  if (source === "manual") return DEFAULT_RULE_PRIORITIES.manual_rule;
  if (source === "correction_history") return DEFAULT_RULE_PRIORITIES.correction_history;
  return DEFAULT_RULE_PRIORITIES[ruleType];
}
