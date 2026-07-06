import { normalizeControlText } from "../normalization/normalizeImportedDescription";

export function isItauNoiseDescription(value: unknown): boolean {
  const text = normalizeControlText(value);
  return (
    text === "SALDO ANTERIOR" ||
    (text.startsWith("SALDO TOTAL DISPON") && text.endsWith("VEL DIA")) ||
    text === "POSICAO CONSOLIDADA" ||
    text === "LIMITES" ||
    text === "LIMITE DA CONTA" ||
    text.startsWith("TOTAL ") ||
    text.startsWith("RESUMO ")
  );
}

export function isFutureSectionMarker(value: unknown): boolean {
  const text = normalizeControlText(value);
  return text === "LANCAMENTOS FUTUROS" || text === "SAIDAS FUTURAS";
}

export function isSummarySectionMarker(value: unknown): boolean {
  const text = normalizeControlText(value);
  return (
    text === "POSICAO CONSOLIDADA" ||
    text === "LIMITES" ||
    text.startsWith("INFORMACOES ADICIONAIS") ||
    text === "AVISO!"
  );
}

export function isTransactionHeader(values: unknown[]): boolean {
  const text = values.map(normalizeControlText).join(" ");
  return text.includes("DATA") && text.includes("LANCAMENTO") && text.includes("VALOR");
}
