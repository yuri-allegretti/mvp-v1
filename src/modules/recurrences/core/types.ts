export type TransactionType = "income" | "expense";
export type TransactionSource = "csv" | "open_finance" | "manual";
export type Frequency = "monthly" | "weekly" | "biweekly" | "yearly" | "unknown";
export type RecurrenceType = "fixed" | "variable";
export type RecurrencePatternKind =
  | "monthly_fixed"
  | "monthly_variable"
  | "weekly_recurring"
  | "biweekly_recurring"
  | "installment"
  | "frequent_supplier"
  | "recurring_income"
  | "irregular_business_recurring";

export interface Transaction {
  id: string;
  companyId: string;
  bankAccountId?: string;
  date: string;
  amount: number;
  type: TransactionType;
  description: string;
  normalizedDescription?: string;
  categoryId?: string;
  counterpartyName?: string;
  documentNumber?: string;
  externalId?: string;
  source?: TransactionSource;
}

export interface NormalizedTransaction extends Transaction {
  normalizedDescription: string;
  normalizedTokens: string[];
  normalizedCounterparty?: string;
  absoluteAmount: number;
  amountBucketIndex: number;
}

export interface TextSimilarityResult {
  score: number;
  jaccardScore: number;
  overlapScore: number;
  importantOverlapScore: number;
  subsetMatch: boolean;
  commonTokens: string[];
  sharedAliasGroups: string[];
  reasons: string[];
}

export interface GroupTextSimilarityResult {
  score: number;
  minScore: number;
  maxScore: number;
  averageScore: number;
  pairCount: number;
  reasons: string[];
}

export interface PeriodicityResult {
  frequency: Frequency;
  score: number;
  averageGapDays?: number;
  monthlyGapRatio: number;
  dayOfMonthConsistencyScore: number;
  expectedNextDate?: string;
  reasons: string[];
}

export interface AmountStabilityResult {
  recurrenceType: RecurrenceType;
  score: number;
  averageAmount: number;
  estimatedNextAmount: number;
  minAmount: number;
  maxAmount: number;
  amountVariationPercent: number;
  coefficientOfVariation: number;
  reasons: string[];
}

export interface CategoryConsistencyResult {
  score: number;
  categoryId?: string;
  reasons: string[];
}

export interface RecurrenceScoreInput {
  periodicity: PeriodicityResult;
  textSimilarity: GroupTextSimilarityResult;
  amountStability: AmountStabilityResult;
  categoryConsistency: CategoryConsistencyResult;
  occurrenceCount: number;
}

export interface RecurrenceScoreResult {
  confidenceScore: number;
  periodicityScore: number;
  textSimilarityScore: number;
  amountStabilityScore: number;
  categoryScore: number;
  occurrenceScore: number;
  reasons: string[];
}

export interface RecurrenceSuggestion {
  id: string;
  companyId: string;
  type: TransactionType;
  categoryId?: string;
  representativeDescription: string;
  normalizedDescription: string;
  transactionIds: string[];
  frequency: Frequency;
  recurrenceType: RecurrenceType;
  patternKind?: RecurrencePatternKind;
  averageAmount: number;
  estimatedNextAmount: number;
  amountVariationPercent: number;
  expectedNextDate?: string;
  confidenceScore: number;
  status: "pending";
  startDate: string;
  endDate?: string;
  installmentCount?: number;
  evidence: {
    textSimilarityScore: number;
    periodicityScore: number;
    amountStabilityScore: number;
    categoryScore: number;
    occurrenceScore: number;
    reasons: string[];
  };
}

export interface CandidateBlock {
  key: string;
  companyId: string;
  type: TransactionType;
  amountBucketIndex: number;
  transactions: NormalizedTransaction[];
}

export interface LabeledTransaction extends Transaction {
  expectedRecurrenceGroupId?: string | null;
}

export interface EvaluationResult {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  expectedPairCount: number;
  predictedPairCount: number;
  suggestionCount: number;
}
