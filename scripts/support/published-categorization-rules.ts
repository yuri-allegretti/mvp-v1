export type PublishedRuleBehavior =
  | "auto_apply"
  | "review"
  | "low_confidence"
  | "conflict";

export interface PublishedCategorizationRuleDefinition {
  pattern: string;
  categoryId: string;
  behavior: PublishedRuleBehavior;
}

const autoApplyRules: PublishedCategorizationRuleDefinition[] = [
  { pattern: "INTERNET EMPRESARIAL FIBRA", categoryId: "cat-expense-internet", behavior: "auto_apply" },
  { pattern: "HONORARIOS CONTABEIS", categoryId: "cat-expense-accounting", behavior: "auto_apply" },
  { pattern: "PLANO SAUDE EQUIPE", categoryId: "cat-expense-health", behavior: "auto_apply" },
  { pattern: "MENSALIDADE CONTRATO PLATAFORMA", categoryId: "cat-income-retainer", behavior: "auto_apply" },
  { pattern: "IMPOSTO EXTRA CAIXA", categoryId: "cat-expense-tax", behavior: "auto_apply" },
  { pattern: "ENERGIA CAMARA FRIA", categoryId: "cat-expense-energy", behavior: "auto_apply" },
  { pattern: "LINK CAIXA E DELIVERY", categoryId: "cat-expense-internet", behavior: "auto_apply" },
  { pattern: "FORNECIMENTO BASE COZINHA", categoryId: "cat-expense-food-supplies", behavior: "auto_apply" },
  { pattern: "REPASSE CANAL PEDIDOS", categoryId: "cat-income-sales", behavior: "auto_apply" },
  { pattern: "TARIFA BANCARIA OPERACAO", categoryId: "cat-expense-banking", behavior: "auto_apply" },
  { pattern: "PLATAFORMA MIDIA PERFORMANCE", categoryId: "cat-expense-marketing", behavior: "auto_apply" },
  { pattern: "BPO FINANCEIRO AGENCIA", categoryId: "cat-expense-accounting", behavior: "auto_apply" },
  { pattern: "RETAINER GROWTH MENSAL", categoryId: "cat-income-retainer", behavior: "auto_apply" },
  { pattern: "RETENCAO CONTEUDO SOCIAL", categoryId: "cat-income-retainer", behavior: "auto_apply" },
  { pattern: "GUIA EXTRA MIDIA", categoryId: "cat-expense-tax", behavior: "auto_apply" },
  { pattern: "ENERGIA EQUIPAMENTOS CLINICOS", categoryId: "cat-expense-energy", behavior: "auto_apply" },
  { pattern: "PACOTE MENSAL ATENDIMENTOS", categoryId: "cat-income-retainer", behavior: "auto_apply" },
  { pattern: "SUPORTE LABORATORIAL SEMANAL", categoryId: "cat-income-consulting", behavior: "auto_apply" },
  { pattern: "PLATAFORMA COMERCIO ONLINE", categoryId: "cat-expense-software", behavior: "auto_apply" },
  { pattern: "REPASSE OPERADOR LOGISTICO", categoryId: "cat-expense-logistics", behavior: "auto_apply" },
  { pattern: "REPASSE MARKETPLACE", categoryId: "cat-income-sales", behavior: "auto_apply" },
  { pattern: "SUPORTE CX E CRM", categoryId: "cat-expense-internet", behavior: "auto_apply" },
  { pattern: "GUIA EXTRA SUBSTITUICAO", categoryId: "cat-expense-tax", behavior: "auto_apply" },
];

const reviewRules: PublishedCategorizationRuleDefinition[] = [
  { pattern: "EMPRESTIMO CAPITAL GIRO", categoryId: "cat-expense-banking", behavior: "review" },
  { pattern: "COMPRA NOTEBOOK DEV", categoryId: "cat-expense-equipment", behavior: "review" },
  { pattern: "PROJETO TEMPORARIO ARQUITETURA", categoryId: "cat-income-consulting", behavior: "review" },
  { pattern: "MANUTENCAO EQUIPAMENTO", categoryId: "cat-expense-maintenance", behavior: "review" },
  { pattern: "TREINAMENTO EQUIPE PRODUTO", categoryId: "cat-expense-training", behavior: "review" },
  { pattern: "REEMBOLSO CLIENTE AJUSTE SLA", categoryId: "cat-income-reimbursement", behavior: "review" },
  { pattern: "REFORMA AREA EXTERNA", categoryId: "cat-expense-equipment", behavior: "review" },
  { pattern: "FORNO COMBINADO PARCELA", categoryId: "cat-expense-equipment", behavior: "review" },
  { pattern: "FESTIVAL INVERNO COTAS", categoryId: "cat-income-sales", behavior: "review" },
  { pattern: "MANUTENCAO EXAUSTAO", categoryId: "cat-expense-maintenance", behavior: "review" },
  { pattern: "TREINAMENTO BRIGADA", categoryId: "cat-expense-training", behavior: "review" },
  { pattern: "REEMBOLSO DELIVERY AJUSTE", categoryId: "cat-income-reimbursement", behavior: "review" },
  { pattern: "KIT VIDEO PRODUTORA", categoryId: "cat-expense-equipment", behavior: "review" },
  { pattern: "BONUS CAMPANHA LANCTO", categoryId: "cat-income-consulting", behavior: "review" },
  { pattern: "ANTECIPACAO FLUXO MIDIA", categoryId: "cat-expense-banking", behavior: "review" },
  { pattern: "REEMBOLSO MIDIA CAMPANHA", categoryId: "cat-income-reimbursement", behavior: "review" },
  { pattern: "EVENTO CLIENTE PROSPECCAO", categoryId: "cat-expense-training", behavior: "review" },
  { pattern: "EQUIPAMENTO IMAGEM PARC", categoryId: "cat-expense-equipment", behavior: "review" },
  { pattern: "PROJETO SAUDE OCUPACIONAL", categoryId: "cat-income-consulting", behavior: "review" },
  { pattern: "ADEQUACAO SALA PROCEDIMENTO", categoryId: "cat-expense-equipment", behavior: "review" },
  { pattern: "MATERIAL CLINICO EXTRA", categoryId: "cat-expense-medical-supplies", behavior: "review" },
  { pattern: "MANUTENCAO AUTOCLAVE", categoryId: "cat-expense-maintenance", behavior: "review" },
  { pattern: "CURSO PROCEDIMENTOS", categoryId: "cat-expense-training", behavior: "review" },
  { pattern: "REEMBOLSO GLOSA REVERSA", categoryId: "cat-income-reimbursement", behavior: "review" },
  { pattern: "ESTRUTURA ESTOQUE PARC", categoryId: "cat-expense-equipment", behavior: "review" },
  { pattern: "CAMPANHA SAZONAL FIM ANO", categoryId: "cat-expense-marketing", behavior: "review" },
  { pattern: "CONTRATO ATACADO TEMPORARIO", categoryId: "cat-income-consulting", behavior: "review" },
  { pattern: "AJUSTE FRETE EXTRA", categoryId: "cat-expense-logistics", behavior: "review" },
  { pattern: "ESTORNO DEVOLUCAO FORNECEDOR", categoryId: "cat-income-reimbursement", behavior: "review" },
  { pattern: "TREINAMENTO HUB OPERACAO", categoryId: "cat-expense-training", behavior: "review" },
];

const conflictRules: PublishedCategorizationRuleDefinition[] = [
  { pattern: "SUPORTE PLATAFORMA CRIACAO", categoryId: "cat-expense-software", behavior: "conflict" },
  { pattern: "SUPORTE PLATAFORMA CRIACAO", categoryId: "cat-expense-marketing", behavior: "conflict" },
];

export const publishedBroadCategorizationRules = [
  ...autoApplyRules,
  ...reviewRules,
  ...conflictRules,
  {
    pattern: "PIX CRIACAO FREELA",
    categoryId: "cat-uncategorized",
    behavior: "low_confidence",
  },
] as const satisfies readonly PublishedCategorizationRuleDefinition[];

export function confidenceForPublishedRule(behavior: PublishedRuleBehavior): number {
  if (behavior === "auto_apply" || behavior === "conflict") return 95;
  if (behavior === "review") return 75;
  return 45;
}
