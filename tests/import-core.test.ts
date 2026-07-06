import path from "node:path";
import { describe, expect, it } from "vitest";
import { importBankStatement } from "../src/modules/import";

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
