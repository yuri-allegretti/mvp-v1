import type { NormalizedTransaction } from "../types.ts";

export const GENERIC_IDENTITY_TOKENS = new Set([
  "pagamento", "pagto", "pgto", "pix", "ted", "doc", "boleto", "debito",
  "credito", "transferencia", "servico", "digital", "sistema", "software",
  "gestao", "empresa", "comercio", "comercial", "loja", "equipamento",
  "marketplace", "mercado", "internet", "telefone", "telefonia", "taxa",
  "fatura", "conta", "parcela", "peca", "posto", "restaurante", "pizzaria",
  "farmacia", "drogaria", "material", "escritorio", "suprimento", "logistica",
  "pedido", "lote", "modulo", "plano", "mensalidade", "assinatura", "fornecedor",
  "cliente", "inc", "corp", "corporacao", "base", "usage", "api"
]);

export type EconomicIdentityStrength = "none" | "weak" | "moderate" | "strong";

export interface EconomicIdentityResult {
  score: number;
  strength: EconomicIdentityStrength;
  commonDistinctiveTokens: string[];
  reasons: string[];
}

export function compareEconomicIdentity(
  left: NormalizedTransaction,
  right: NormalizedTransaction
): EconomicIdentityResult {
  const leftDocument = normalizedDocument(left.documentNumber);
  const rightDocument = normalizedDocument(right.documentNumber);
  if (leftDocument && rightDocument && leftDocument === rightDocument) {
    return result(0.98, "strong", [], "documento economico igual");
  }

  if (
    left.normalizedCounterparty &&
    right.normalizedCounterparty &&
    left.normalizedCounterparty === right.normalizedCounterparty
  ) {
    return result(0.95, "strong", [], "contraparte normalizada igual");
  }

  const leftDistinctive = getDistinctiveTokens(left);
  const rightDistinctive = getDistinctiveTokens(right);
  const rightSet = new Set(rightDistinctive);
  const common = leftDistinctive.filter((token) => rightSet.has(token));

  if (
    left.normalizedDescription &&
    left.normalizedDescription === right.normalizedDescription &&
    leftDistinctive.length > 0
  ) {
    return result(0.92, "strong", common, "descricao economica normalizada igual");
  }

  if (common.length >= 2) {
    return result(0.88, "strong", common, "dois ou mais tokens distintivos comuns");
  }

  const smallerDistinctiveCount = Math.min(leftDistinctive.length, rightDistinctive.length);
  if (common.length === 1 && smallerDistinctiveCount === 1) {
    return result(0.72, "moderate", common, "nucleo distintivo comum em descricao curta");
  }

  if (common.length === 1) {
    return result(0.62, "moderate", common, "um token distintivo comum");
  }

  return result(0, "none", [], "sem identidade economica textual comum");
}

export function getDistinctiveTokens(transaction: NormalizedTransaction): string[] {
  return transaction.normalizedTokens.filter((token) =>
    token.length >= 3 && !GENERIC_IDENTITY_TOKENS.has(token)
  );
}

export function extractDocumentNumber(description: string): string | undefined {
  const formatted = description.match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/]?\d{4}[-\s]?\d{2}\b/);
  if (formatted) return formatted[0].replace(/\D/g, "");

  const compact = description.match(/\b(?:\d{11}|\d{14})\b/);
  return compact?.[0];
}

function normalizedDocument(value: string | undefined): string | undefined {
  const document = value?.replace(/\D/g, "");
  return document && (document.length === 11 || document.length === 14) ? document : undefined;
}

function result(
  score: number,
  strength: EconomicIdentityStrength,
  commonDistinctiveTokens: string[],
  reason: string
): EconomicIdentityResult {
  return { score, strength, commonDistinctiveTokens, reasons: [reason] };
}
