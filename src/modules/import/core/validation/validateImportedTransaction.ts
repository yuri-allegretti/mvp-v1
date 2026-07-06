import type { ImportedBankTransaction, ImportIssue } from "../types";

export function validateImportedTransaction(
  transaction: ImportedBankTransaction,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const row =
    transaction.sourceRowNumber === undefined
      ? {}
      : { rowNumber: transaction.sourceRowNumber };

  if (!transaction.companyId.trim()) {
    issues.push({
      code: "MISSING_COMPANY_ID",
      severity: "error",
      message: "A empresa da transação está ausente.",
      ...row,
    });
  }
  if (!transaction.bankAccountId.trim()) {
    issues.push({
      code: "MISSING_BANK_ACCOUNT_ID",
      severity: "error",
      message: "A conta bancária da transação está ausente.",
      ...row,
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
    issues.push({
      code: "INVALID_DATE",
      severity: "error",
      message: "A data canônica da transação é inválida.",
      ...row,
    });
  }
  if (!Number.isFinite(transaction.amount) || transaction.amount === 0) {
    issues.push({
      code: transaction.amount === 0 ? "ZERO_AMOUNT" : "INVALID_AMOUNT",
      severity: "error",
      message: "O valor canônico da transação é inválido.",
      ...row,
    });
  }
  if (!transaction.description.trim()) {
    issues.push({
      code: "MISSING_DESCRIPTION",
      severity: "error",
      message: "A descrição da transação está ausente.",
      ...row,
    });
  }
  if (
    (transaction.amount > 0 && transaction.type !== "income") ||
    (transaction.amount < 0 && transaction.type !== "expense")
  ) {
    issues.push({
      code: "INVALID_TRANSACTION_TYPE",
      severity: "error",
      message: "O tipo da transação não corresponde ao sinal do valor.",
      ...row,
    });
  }
  if (!transaction.externalId.startsWith("hash-v1:")) {
    issues.push({
      code: "INVALID_EXTERNAL_ID",
      severity: "error",
      message: "O identificador externo da transação é inválido.",
      ...row,
    });
  }

  return issues;
}
