import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { importBankStatement } from "../src/modules/import";
import { deduplicateImportedTransactions } from "../src/modules/import/core/deduplication/deduplicateImportedTransactions";
import { generateExternalId } from "../src/modules/import/core/deduplication/generateExternalId";
import { parseItauSpreadsheet } from "../src/modules/import/core/parsers/itauXlsxParser";
import type { ImportedBankTransaction } from "../src/modules/import/core/types";

const fixturesDirectory = path.join(process.cwd(), "tests", "fixtures", "import");
const xlsFixture = path.join(fixturesDirectory, "Extrato Conta Corrente-200620262150.xls");
const pdfFixture = path.join(fixturesDirectory, "extrato-itau_20_06_2026_21-54.pdf");

function importFixture(filePath: string, sourceFileId: string) {
  return importBankStatement({
    filePath,
    companyId: "company_1",
    bankAccountId: "account_1",
    sourceFileId,
  });
}

describe("Itaú import core", () => {
  it("marks rows with FUTURO origin as future transactions", () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ["ITAU EMPRESAS"],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      ["DATA", "LANCAMENTO", "AG./ORIGEM", "VALOR (R$)", "SALDO (R$)"],
      ["24/02/2025", "LANCAMENTO FUTURO TESTE", "FUTURO", -920, 1000],
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      "Lancamentos",
    );

    const parsed = parseItauSpreadsheet(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
      "xlsx",
    );

    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0]?.disposition).toBe("future");
    expect(parsed.lines[0]?.reasonCode).toBe("FUTURE_TRANSACTION_SKIPPED");
  });

  it("deduplicates exact rows by their base identity but keeps probable duplicates", () => {
    const identity = {
      companyId: "company_1",
      bankAccountId: "account_1",
      date: "2025-01-08",
      amount: -9500,
      description: "DEB AUTO ALUGUEL HUB TECNICO",
    };
    const transaction = (occurrenceIndex: number): ImportedBankTransaction => ({
      ...identity,
      source: "itau_xlsx",
      sourceFileId: "fixture",
      type: "expense",
      externalId: generateExternalId({ ...identity, occurrenceIndex }),
    });
    const exactResult = deduplicateImportedTransactions([transaction(1), transaction(2)]);
    expect(exactResult.transactions).toHaveLength(1);
    expect(exactResult.duplicates).toHaveLength(1);

    const probable = transaction(1);
    probable.date = "2025-01-09";
    probable.description = "PIX ALUGUEL HUB TECNICO";
    probable.externalId = generateExternalId({
      ...identity,
      date: probable.date,
      description: probable.description,
    });
    const probableResult = deduplicateImportedTransactions([transaction(1), probable]);
    expect(probableResult.transactions).toHaveLength(2);
    expect(probableResult.duplicates).toHaveLength(0);
  });

  it("imports the validated XLS fixture as 36 canonical transactions", async () => {
    const result = await importFixture(xlsFixture, "xls-import-1");

    expect(result.report.errors).toEqual([]);
    expect(result.report.detectedBank).toBe("itau");
    expect(result.report.detectedFormat).toBe("xls");
    expect(result.report.totalRows).toBe(53);
    expect(result.report.ignoredRows).toBe(17);
    expect(result.report.importedTransactions).toBe(36);
    expect(result.report.invalidRows).toBe(0);
    expect(result.transactions).toHaveLength(36);

    for (const transaction of result.transactions) {
      expect(transaction.companyId).toBe("company_1");
      expect(transaction.bankAccountId).toBe("account_1");
      expect(transaction.sourceFileId).toBe("xls-import-1");
      expect(transaction.date).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(transaction.amount).not.toBe(0);
      expect(transaction.type).toBe(transaction.amount > 0 ? "income" : "expense");
      expect(transaction.externalId).toMatch(/^hash-v1:[a-f0-9]{64}$/);
    }

    expect(
      result.transactions.find((transaction) => transaction.description.startsWith("DA COPEL")),
    ).toMatchObject({
      counterpartyName: "COPEL",
      documentNumber: "0000001778170",
    });
    expect(
      result.transactions.find((transaction) =>
        transaction.description.startsWith("CREDIARIO ITAU"),
      ),
    ).toMatchObject({ counterpartyName: "ITAU", documentNumber: "73955" });
  });

  it("imports the equivalent PDF fixture with the same externalIds as XLS", async () => {
    const [xls, pdf] = await Promise.all([
      importFixture(xlsFixture, "xls-import-2"),
      importFixture(pdfFixture, "pdf-import-1"),
    ]);

    expect(pdf.report.errors).toEqual([]);
    expect(pdf.report.detectedFormat).toBe("pdf");
    expect(pdf.report.importedTransactions).toBe(36);
    expect(pdf.transactions.map((transaction) => transaction.externalId).sort()).toEqual(
      xls.transactions.map((transaction) => transaction.externalId).sort(),
    );
  });
});
