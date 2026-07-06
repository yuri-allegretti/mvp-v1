export const DEFAULT_STOP_WORDS = new Set([
  "pix",
  "enviado",
  "enviada",
  "recebido",
  "recebida",
  "ted",
  "doc",
  "pagto",
  "pgto",
  "pag",
  "pagamento",
  "pago",
  "compra",
  "compras",
  "debito",
  "credito",
  "transferencia",
  "cartao",
  "boleto",
  "ltda",
  "me",
  "mei",
  "eireli",
  "sa",
  "s",
  "a",
  "banco",
  "agencia",
  "conta",
  "aut",
  "auto",
  "automatico",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "online",
  "www",
  "com",
  "br"
]);

export const DEFAULT_ALIAS_GROUPS: Record<string, string[]> = {
  rent: ["aluguel", "locacao", "imobiliaria"],
  energy: ["energia", "eletrica", "luz", "enel", "cemig", "light", "copel", "celesc", "neoenergia"],
  telecom: ["internet", "telefone", "telefonia", "vivo", "claro", "tim", "oi"],
  streaming: ["netflix", "spotify", "deezer", "youtube", "primevideo"],
  software: ["google", "microsoft", "aws", "azure", "adobe", "saas"],
  insurance: ["seguro", "seguros", "seguradora"],
  payroll: ["salario", "folha", "prolabore"],
  commission: ["comissao"],
  taxes: ["imposto", "darf", "simples"]
};

export interface ThresholdConfig {
  minimumSuggestionScore: number;
  minimumPeriodicityScoreForSuggestion: number;
  textSimilarityThreshold: number;
  weakTextSimilarityThreshold: number;
  amountRelativeTolerance: number;
  monthlyVariableAmountRelativeTolerance: number;
  strictAmountRelativeTolerance: number;
  monthlyGapMinDays: number;
  monthlyGapMaxDays: number;
  monthlyMaxGapMonths: number;
  monthlyDayTolerance: number;
  amountBands: readonly number[];
  scoreWeights: {
    periodicity: number;
    textSimilarity: number;
    amountStability: number;
    category: number;
    occurrence: number;
  };
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  minimumSuggestionScore: 60,
  minimumPeriodicityScoreForSuggestion: 0.55,
  textSimilarityThreshold: 0.55,
  weakTextSimilarityThreshold: 0.35,
  amountRelativeTolerance: 0.35,
  monthlyVariableAmountRelativeTolerance: 0.6,
  strictAmountRelativeTolerance: 0.12,
  monthlyGapMinDays: 25,
  monthlyGapMaxDays: 35,
  monthlyMaxGapMonths: 3,
  monthlyDayTolerance: 5,
  amountBands: [0, 50, 100, 250, 500, 1000, 2500],
  scoreWeights: {
    periodicity: 30,
    textSimilarity: 25,
    amountStability: 20,
    category: 15,
    occurrence: 10
  }
};

export type DetectionThresholdOverrides = Partial<Omit<ThresholdConfig, "scoreWeights">> & {
  scoreWeights?: Partial<ThresholdConfig["scoreWeights"]>;
};

export function mergeThresholds(overrides?: DetectionThresholdOverrides): ThresholdConfig {
  if (!overrides) {
    return DEFAULT_THRESHOLDS;
  }

  return {
    ...DEFAULT_THRESHOLDS,
    ...overrides,
    scoreWeights: {
      ...DEFAULT_THRESHOLDS.scoreWeights,
      ...overrides.scoreWeights
    }
  };
}
