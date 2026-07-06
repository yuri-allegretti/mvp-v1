import { normalizeImportedDescription } from "../normalization/normalizeImportedDescription";

export interface CounterpartyExtraction {
  counterpartyName?: string;
  documentNumber?: string;
  rule?: string;
}

function hasLetters(value: string): boolean {
  return /[A-ZÀ-ÖØ-Ý]/i.test(value);
}

export function extractItauCounterparty(
  rawDescription: string,
): CounterpartyExtraction {
  const description = normalizeImportedDescription(rawDescription);
  let match: RegExpExecArray | null;

  match = /^PIX\s+TRANSF\s+(.+?)\s*(\d{2}\/\d{2})$/i.exec(description);
  if (match) {
    const candidate = (match[1] ?? "").trim();
    return hasLetters(candidate)
      ? { counterpartyName: candidate, rule: "pix-transf-v1" }
      : { rule: "pix-transf-v1" };
  }

  match = /^PIX\s+QRS\s+(.+?)\s*(\d{2}\/\d{2})$/i.exec(description);
  if (match) {
    const candidate = (match[1] ?? "").trim();
    return hasLetters(candidate)
      ? { counterpartyName: candidate, rule: "pix-qrs-v1" }
      : { rule: "pix-qrs-v1" };
  }

  match = /^DA\s+(.+?)\s+([0-9][0-9A-Z./-]*)$/i.exec(description);
  if (match) {
    return {
      counterpartyName: match[1]!.trim(),
      documentNumber: match[2]!,
      rule: "direct-debit-v1",
    };
  }

  match = /^DEB\s+AUTOR\s+(.+)$/i.exec(description);
  if (match) {
    const remainder = (match[1] ?? "").trim();
    const separatedDocument = /^(\d{4,})\s+(.+)$/.exec(remainder);
    if (separatedDocument) {
      return {
        counterpartyName: separatedDocument[2]!.trim(),
        documentNumber: separatedDocument[1]!,
        rule: "authorized-debit-v1",
      };
    }
    return { counterpartyName: remainder, rule: "authorized-debit-v1" };
  }

  match = /^SISPAG\s+(.+)$/i.exec(description);
  if (match) {
    return { counterpartyName: match[1]!.trim(), rule: "sispag-v1" };
  }

  match = /^ITAU\s+BLACK\s+([0-9-]+)$/i.exec(description);
  if (match) {
    return {
      counterpartyName: "ITAU BLACK",
      documentNumber: match[1]!,
      rule: "itau-black-v1",
    };
  }

  match = /^CREDIARIO\s+ITAU\s+(\d+)$/i.exec(description);
  if (match) {
    return {
      counterpartyName: "ITAU",
      documentNumber: match[1]!,
      rule: "crediario-itau-v1",
    };
  }

  match = /^PAG\s+TIT\s+INT\s+([0-9A-Z./-]+)$/i.exec(description);
  if (match) return { documentNumber: match[1]!, rule: "internal-title-v1" };

  match = /^SAQUE\s+DIN\s+ATM\s+CART\s+([0-9A-Z./-]+)$/i.exec(description);
  if (match) return { documentNumber: match[1]!, rule: "atm-withdrawal-v1" };

  if (/^IOF$/i.test(description)) {
    return { counterpartyName: "ITAU", rule: "itau-bank-charge-v1" };
  }

  if (/^JUROS\s+LIMITE\s+DA\s+CONTA$/i.test(description)) {
    return { counterpartyName: "ITAU", rule: "itau-overdraft-interest-v1" };
  }

  return {};
}
