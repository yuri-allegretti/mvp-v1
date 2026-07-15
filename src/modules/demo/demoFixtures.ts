import * as XLSX from "xlsx";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

export interface DemoFixtureDescriptor {
  fileName: string;
  description: string;
  companyId: string;
  bankAccountId: string;
  transactionCount: number;
}

interface FixtureTransaction {
  date: string;
  description: string;
  amount: number;
}

interface WorkbookAccountMeta {
  holderName: string;
  agency: string;
  accountNumber: string;
}

export const demoFixturesDirectoryName = "demo-fixtures";

export const demoFixtureFiles = {
  principal: "01-itau-demo-principal.xlsx",
  reimport: "02-itau-demo-reimportacao.xlsx",
  duplicates: "03-itau-demo-duplicidades-possiveis.xlsx",
  secondAccount: "04-itau-demo-segunda-conta.xlsx",
  isolation: "05-itau-demo-isolamento-empresa.xlsx",
} as const;

const principalTransactions: readonly FixtureTransaction[] = [
  { date: "2026-01-05", description: "SISPAG CLIENTE ALFA RETAINER", amount: 12000 },
  { date: "2026-01-05", description: "DEB AUTOR IMOBILIARIA SOLAR", amount: -4500 },
  { date: "2026-01-06", description: "PIX TRANSF CONTABILIDADE ALFA 06/01", amount: -480 },
  { date: "2026-01-07", description: "DA RECEITA FEDERAL 12345678000199", amount: -1850 },
  { date: "2026-01-08", description: "GOOGLE WORKSPACE BUSINESS", amount: -129.9 },
  { date: "2026-01-09", description: "DA VIVO FIBRA 301389120", amount: -289.9 },
  { date: "2026-01-10", description: "PIX TRANSF ACME CLOUD 10/01", amount: -399.9 },
  { date: "2026-01-11", description: "PIX TRANSF NOTEBOOK PARCELA 01/06 11/01", amount: -900 },
  { date: "2026-01-12", description: "PIX TRANSF META ADS 12/01", amount: -850 },
  { date: "2026-01-13", description: "PIX TRANSF MERCADO CENTRAL 13/01", amount: -220 },
  { date: "2026-01-14", description: "PIX TRANSF CLIENTE EVENTUAL 14/01", amount: 2300 },
  { date: "2026-01-15", description: "PIX TRANSF ERP LEGACY 15/01", amount: -610 },
  { date: "2026-01-16", description: "PIX TRANSF RECEITA ERRADA 16/01", amount: -100 },
  { date: "2026-02-05", description: "SISPAG CLIENTE ALFA RETAINER", amount: 12150 },
  { date: "2026-02-05", description: "DEB AUTOR IMOBILIARIA SOLAR", amount: -4500 },
  { date: "2026-02-06", description: "PIX TRANSF CONTABILIDADE ALFA 06/02", amount: -490 },
  { date: "2026-02-07", description: "DA RECEITA FEDERAL 12345678000199", amount: -1900 },
  { date: "2026-02-08", description: "GOOGLE WORKSPACE BUSINESS", amount: -129.9 },
  { date: "2026-02-09", description: "DA VIVO FIBRA 301389120", amount: -319.9 },
  { date: "2026-02-10", description: "PIX TRANSF ACME CLOUD 10/02", amount: -399.9 },
  { date: "2026-02-11", description: "PIX TRANSF NOTEBOOK PARCELA 02/06 11/02", amount: -900 },
  { date: "2026-02-12", description: "PIX TRANSF META ADS 12/02", amount: -900 },
  { date: "2026-02-13", description: "ITAU BLACK 3111-7157", amount: -3400 },
  { date: "2026-02-14", description: "JUROS LIMITE DA CONTA", amount: -160 },
  { date: "2026-02-17", description: "PIX TRANSF DUPLICIDADE ACME 17/02", amount: -750 },
  { date: "2026-02-17", description: "PIX TRANSF DUPLICIDADE ACME - 17/02", amount: -750 },
  { date: "2026-03-05", description: "SISPAG CLIENTE ALFA RETAINER", amount: 11950 },
  { date: "2026-03-05", description: "DEB AUTOR IMOBILIARIA SOLAR", amount: -4500 },
  { date: "2026-03-06", description: "PIX TRANSF CONTABILIDADE ALFA 06/03", amount: -485 },
  { date: "2026-03-07", description: "DA RECEITA FEDERAL 12345678000199", amount: -1920 },
  { date: "2026-03-08", description: "GOOGLE WORKSPACE BUSINESS", amount: -129.9 },
  { date: "2026-03-09", description: "DA VIVO FIBRA 301389120", amount: -305.9 },
  { date: "2026-03-10", description: "PIX TRANSF ACME CLOUD 10/03", amount: -399.9 },
  { date: "2026-03-11", description: "PIX TRANSF NOTEBOOK PARCELA 03/06 11/03", amount: -900 },
  { date: "2026-03-12", description: "DA COPEL ENERGIA 90001", amount: -410 },
  { date: "2026-03-18", description: "PIX TRANSF CONTA PROPRIA 18/03", amount: -1200 },
  { date: "2026-03-22", description: "PIX TRANSF FOLHA EMPRESA 22/03", amount: -6800 },
  { date: "2026-04-05", description: "SISPAG CLIENTE ALFA RETAINER", amount: 12200 },
  { date: "2026-04-05", description: "DEB AUTOR IMOBILIARIA SOLAR", amount: -4500 },
  { date: "2026-04-06", description: "PIX TRANSF CONTABILIDADE ALFA 06/04", amount: -500 },
  { date: "2026-04-07", description: "DA RECEITA FEDERAL 12345678000199", amount: -1880 },
  { date: "2026-04-08", description: "GOOGLE WORKSPACE BUSINESS", amount: -129.9 },
  { date: "2026-04-09", description: "DA VIVO FIBRA 301389120", amount: -329.9 },
  { date: "2026-04-10", description: "PIX TRANSF ACME CLOUD 10/04", amount: -399.9 },
  { date: "2026-04-11", description: "PIX TRANSF NOTEBOOK PARCELA 04/06 11/04", amount: -900 },
  { date: "2026-04-14", description: "CREDIARIO ITAU 73955", amount: 7000 },
] as const;

const duplicateTransactions: readonly FixtureTransaction[] = [
  { date: "2026-05-03", description: "PIX TRANSF FORNECEDOR BETA 03/05", amount: -1200 },
  { date: "2026-05-03", description: "PIX TRANSF FORNECEDOR BETA - 03/05", amount: -1200 },
  { date: "2026-05-05", description: "PIX TRANSF ACME CLOUD 05/05", amount: -399.9 },
  { date: "2026-05-05", description: "PIX TRANSF ACME CLOUD - 05/05", amount: -399.9 },
  { date: "2026-05-07", description: "PIX TRANSF DUPLICIDADE ACME 07/05", amount: -750 },
  { date: "2026-05-07", description: "PIX TRANSF DUPLICIDADE ACME - 07/05", amount: -750 },
] as const;

const secondAccountTransactions = principalTransactions.slice(0, 12);

const isolationTransactions: readonly FixtureTransaction[] = [
  { date: "2026-02-05", description: "SISPAG CLIENTE ALFA RETAINER", amount: 8100 },
  { date: "2026-02-05", description: "DEB AUTOR IMOBILIARIA SOLAR", amount: -2500 },
  { date: "2026-02-06", description: "PIX TRANSF CONTABILIDADE ALFA 06/02", amount: -480 },
  { date: "2026-02-07", description: "DA RECEITA FEDERAL 12345678000199", amount: -910 },
  { date: "2026-02-08", description: "GOOGLE WORKSPACE BUSINESS", amount: -129.9 },
  { date: "2026-02-09", description: "DA VIVO FIBRA 301389120", amount: -219.9 },
  { date: "2026-02-10", description: "PIX TRANSF ACME CLOUD 10/02", amount: -399.9 },
  { date: "2026-02-11", description: "PIX TRANSF NOTEBOOK PARCELA 01/06 11/02", amount: -700 },
] as const;

const fixtureDescriptors: readonly DemoFixtureDescriptor[] = [
  {
    fileName: demoFixtureFiles.principal,
    description: "Fluxo principal completo com 46 transações, recorrências, conflitos, pendências e duplicidade possível.",
    companyId: "demo-company",
    bankAccountId: "demo-itau-account",
    transactionCount: principalTransactions.length,
  },
  {
    fileName: demoFixtureFiles.reimport,
    description: "Cópia byte a byte do fixture principal para validar reimportação idempotente.",
    companyId: "demo-company",
    bankAccountId: "demo-itau-account",
    transactionCount: principalTransactions.length,
  },
  {
    fileName: demoFixtureFiles.duplicates,
    description: "Lançamentos muito parecidos no mesmo dia para produzir DuplicateCandidate e pending possible_duplicate.",
    companyId: "demo-company",
    bankAccountId: "demo-itau-account",
    transactionCount: duplicateTransactions.length,
  },
  {
    fileName: demoFixtureFiles.secondAccount,
    description: "Subset importável na conta secundária para testar múltiplas contas sem colidir externalId.",
    companyId: "demo-company",
    bankAccountId: "demo-itau-account-secondary",
    transactionCount: secondAccountTransactions.length,
  },
  {
    fileName: demoFixtureFiles.isolation,
    description: "Arquivo da Empresa Isolamento para validar separação cross-company.",
    companyId: "demo-isolation-company",
    bankAccountId: "demo-isolation-itau-account",
    transactionCount: isolationTransactions.length,
  },
] as const;

export function listDemoFixtureDescriptors(): DemoFixtureDescriptor[] {
  return [...fixtureDescriptors];
}

export function demoFixturesDirectory(projectRoot = process.cwd()): string {
  return path.join(projectRoot, demoFixturesDirectoryName);
}

export function demoFixturePath(
  fixture: keyof typeof demoFixtureFiles,
  projectRoot = process.cwd(),
): string {
  return path.join(demoFixturesDirectory(projectRoot), demoFixtureFiles[fixture]);
}

function formatItauDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    throw new Error(`Invalid fixture date: ${isoDate}`);
  }
  return `${day}/${month}/${year}`;
}

function buildTransactionSheetRows(
  transactions: readonly FixtureTransaction[],
  account: WorkbookAccountMeta,
): (string | number | null)[][] {
  const openingBalance = -2500;

  return [
    ["Logotipo Itaú", null, null, null, null],
    ["Atualização:", "07/07/2026 às 09:30:00", null, null, null],
    ["Nome:", account.holderName, null, null, null],
    ["Agência:", account.agency, null, null, null],
    ["Conta:", account.accountNumber, null, null, null],
    [null, null, null, null, null],
    ["Lançamentos", null, null, null, null],
    [null, null, null, null, null],
    ["data", "lançamento", "ag./origem", "valor (R$)", "saldos (R$)"],
    ["lançamentos", "", "", "", ""],
    [formatItauDate(transactions[0]?.date ?? "2026-01-01"), "SALDO ANTERIOR", "", "", openingBalance],
    ...transactions.map((transaction) => [
      formatItauDate(transaction.date),
      transaction.description,
      "",
      transaction.amount,
      "",
    ]),
    ["Posição Consolidada", null, null, null, null],
  ];
}

function buildSummarySheetRows(
  transactions: readonly FixtureTransaction[],
  account: WorkbookAccountMeta,
): (string | number | null)[][] {
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  return [
    ["Logotipo Itaú", null, null, null],
    ["Atualização:", "07/07/2026 às 09:30:00", null, null],
    ["Nome:", account.holderName, null, null],
    ["Agência:", account.agency, null, null],
    ["Conta:", account.accountNumber, null, null],
    [null, null, null, null],
    ["Posição Consolidada", null, null, null],
    [null, null, null, null],
    ["Descrição", "", "", "valor"],
    ["(=) saldo total disponível", "", "", total],
  ];
}

function createWorkbook(
  transactions: readonly FixtureTransaction[],
  account: WorkbookAccountMeta,
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const transactionSheet = XLSX.utils.aoa_to_sheet(buildTransactionSheetRows(transactions, account));
  const summarySheet = XLSX.utils.aoa_to_sheet(buildSummarySheetRows(transactions, account));

  XLSX.utils.book_append_sheet(workbook, transactionSheet, "Lançamentos");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Posição Consolidada");
  return workbook;
}

function writeWorkbook(
  filePath: string,
  transactions: readonly FixtureTransaction[],
  account: WorkbookAccountMeta,
): void {
  const workbook = createWorkbook(transactions, account);
  XLSX.writeFile(workbook, filePath, { bookType: "xlsx" });
}

export async function prepareDemoFixtures(projectRoot = process.cwd()): Promise<{
  directory: string;
  files: DemoFixtureDescriptor[];
}> {
  const directory = demoFixturesDirectory(projectRoot);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  writeWorkbook(
    demoFixturePath("principal", projectRoot),
    principalTransactions,
    {
      holderName: "EMPRESA DEMO LTDA",
      agency: "0001",
      accountNumber: "11180-5",
    },
  );

  await copyFile(
    demoFixturePath("principal", projectRoot),
    demoFixturePath("reimport", projectRoot),
  );

  writeWorkbook(
    demoFixturePath("duplicates", projectRoot),
    duplicateTransactions,
    {
      holderName: "EMPRESA DEMO LTDA",
      agency: "0001",
      accountNumber: "11180-5",
    },
  );

  writeWorkbook(
    demoFixturePath("secondAccount", projectRoot),
    secondAccountTransactions,
    {
      holderName: "EMPRESA DEMO LTDA",
      agency: "0001",
      accountNumber: "22220-8",
    },
  );

  writeWorkbook(
    demoFixturePath("isolation", projectRoot),
    isolationTransactions,
    {
      holderName: "EMPRESA ISOLAMENTO LTDA",
      agency: "0099",
      accountNumber: "33330-2",
    },
  );

  return {
    directory,
    files: listDemoFixtureDescriptors(),
  };
}
