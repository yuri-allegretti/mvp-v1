import {
  CategorizationRuleSource,
  CategorizationRuleStatus,
  CategorizationRuleType,
  ExpectedTransactionType,
  Prisma,
  Role,
  type PrismaClient,
} from "@prisma/client";
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../lib/prisma";

export const demoCompanyId = "demo-company";
export const demoIsolationCompanyId = "demo-isolation-company";
export const demoCompanyIds = [demoCompanyId, demoIsolationCompanyId] as const;

export const demoBankAccountId = "demo-itau-account";
export const demoSecondaryBankAccountId = "demo-itau-account-secondary";
export const demoIsolationBankAccountId = "demo-isolation-itau-account";

export const demoAdminUserId = "demo-admin";
export const demoAccountantUserId = "demo-accountant";
export const demoViewerUserId = "demo-viewer";
export const recommendedDemoUserId = demoAccountantUserId;

export const demoUserIds = [
  demoAdminUserId,
  demoAccountantUserId,
  demoViewerUserId,
] as const;

interface DemoUserDefinition {
  id: (typeof demoUserIds)[number];
  email: string;
  name: string;
  role: Role;
}

interface DemoCompanyDefinition {
  id: (typeof demoCompanyIds)[number];
  name: string;
  bankAccounts: Array<{
    id: string;
    bankName: string;
    agency: string;
    accountNumberMasked: string;
  }>;
}

interface DemoCategoryDefinition {
  slug: string;
  idBase: string;
  name: string;
  expectedTransactionType: ExpectedTransactionType;
  isActive?: boolean;
}

interface DemoRuleDefinition {
  slug: string;
  idBase: string;
  categorySlug: string;
  ruleType: CategorizationRuleType;
  conditions: Prisma.InputJsonValue;
  priority: number;
  confidence: number;
}

const demoUsers: readonly DemoUserDefinition[] = [
  {
    id: demoAdminUserId,
    email: "admin@zelo.local",
    name: "Admin Demo",
    role: Role.admin,
  },
  {
    id: demoAccountantUserId,
    email: "accountant@zelo.local",
    name: "Accountant Demo",
    role: Role.accountant,
  },
  {
    id: demoViewerUserId,
    email: "viewer@zelo.local",
    name: "Viewer Demo",
    role: Role.viewer,
  },
] as const;

export const demoCompanies: readonly DemoCompanyDefinition[] = [
  {
    id: demoCompanyId,
    name: "Empresa Demo",
    bankAccounts: [
      {
        id: demoBankAccountId,
        bankName: "Itaú",
        agency: "0001",
        accountNumberMasked: "****1234",
      },
      {
        id: demoSecondaryBankAccountId,
        bankName: "Itaú",
        agency: "0001",
        accountNumberMasked: "****5678",
      },
    ],
  },
  {
    id: demoIsolationCompanyId,
    name: "Empresa Isolamento",
    bankAccounts: [
      {
        id: demoIsolationBankAccountId,
        bankName: "Itaú",
        agency: "0099",
        accountNumberMasked: "****9012",
      },
    ],
  },
] as const;

export const demoCategoryDefinitions: readonly DemoCategoryDefinition[] = [
  { slug: "vendas", idBase: "cat-vendas", name: "Vendas", expectedTransactionType: ExpectedTransactionType.income },
  { slug: "aluguel", idBase: "cat-aluguel", name: "Aluguel", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "folha", idBase: "cat-folha", name: "Folha", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "impostos", idBase: "cat-impostos", name: "Impostos", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "software", idBase: "cat-software", name: "Software", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "energia", idBase: "cat-energia", name: "Energia", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "internet", idBase: "cat-internet", name: "Internet", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "contabilidade", idBase: "cat-contabilidade", name: "Contabilidade", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "fornecedor", idBase: "cat-fornecedor", name: "Fornecedor", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "marketing", idBase: "cat-marketing", name: "Marketing", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "emprestimo", idBase: "cat-emprestimo", name: "Empréstimo", expectedTransactionType: ExpectedTransactionType.both },
  { slug: "cartao", idBase: "cat-cartao", name: "Cartão", expectedTransactionType: ExpectedTransactionType.expense },
  { slug: "tarifas-bancarias", idBase: "cat-tarifas-bancarias", name: "Tarifas bancárias", expectedTransactionType: ExpectedTransactionType.expense },
  {
    slug: "transferencia-interna",
    idBase: "cat-transferencia-interna",
    name: "Transferência interna",
    expectedTransactionType: ExpectedTransactionType.both,
  },
  { slug: "outros", idBase: "cat-outros", name: "Outros", expectedTransactionType: ExpectedTransactionType.both },
  {
    slug: "software-legado",
    idBase: "cat-software-legado",
    name: "Software legado",
    expectedTransactionType: ExpectedTransactionType.expense,
    isActive: false,
  },
] as const;

export const demoRuleDefinitions: readonly DemoRuleDefinition[] = [
  {
    slug: "aluguel-counterparty",
    idBase: "rule-aluguel-counterparty",
    categorySlug: "aluguel",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "IMOBILIARIA" },
    priority: 950,
    confidence: 95,
  },
  {
    slug: "vendas-counterparty",
    idBase: "rule-vendas-counterparty",
    categorySlug: "vendas",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "CLIENTE ALFA" },
    priority: 940,
    confidence: 94,
  },
  {
    slug: "software-description",
    idBase: "rule-software-description",
    categorySlug: "software",
    ruleType: CategorizationRuleType.description_contains,
    conditions: { value: "GOOGLE WORKSPACE" },
    priority: 930,
    confidence: 96,
  },
  {
    slug: "contabilidade-counterparty-amount",
    idBase: "rule-contabilidade-counterparty-amount",
    categorySlug: "contabilidade",
    ruleType: CategorizationRuleType.counterparty_and_amount_range,
    conditions: {
      counterparty: "CONTABILIDADE ALFA",
      min: 450,
      max: 550,
    },
    priority: 920,
    confidence: 93,
  },
  {
    slug: "impostos-document",
    idBase: "rule-impostos-document",
    categorySlug: "impostos",
    ruleType: CategorizationRuleType.document_equals,
    conditions: { value: "12345678000199" },
    priority: 980,
    confidence: 97,
  },
  {
    slug: "internet-counterparty",
    idBase: "rule-internet-counterparty",
    categorySlug: "internet",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "VIVO FIBRA" },
    priority: 910,
    confidence: 92,
  },
  {
    slug: "energia-counterparty",
    idBase: "rule-energia-counterparty",
    categorySlug: "energia",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "COPEL" },
    priority: 905,
    confidence: 92,
  },
  {
    slug: "cartao-description",
    idBase: "rule-cartao-description",
    categorySlug: "cartao",
    ruleType: CategorizationRuleType.description_contains,
    conditions: { value: "ITAU BLACK" },
    priority: 900,
    confidence: 95,
  },
  {
    slug: "tarifas-description",
    idBase: "rule-tarifas-description",
    categorySlug: "tarifas-bancarias",
    ruleType: CategorizationRuleType.description_contains,
    conditions: { value: "JUROS LIMITE DA CONTA" },
    priority: 890,
    confidence: 93,
  },
  {
    slug: "transferencia-counterparty",
    idBase: "rule-transferencia-counterparty",
    categorySlug: "transferencia-interna",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "CONTA PROPRIA" },
    priority: 880,
    confidence: 92,
  },
  {
    slug: "folha-counterparty",
    idBase: "rule-folha-counterparty",
    categorySlug: "folha",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "FOLHA EMPRESA" },
    priority: 870,
    confidence: 94,
  },
  {
    slug: "emprestimo-description",
    idBase: "rule-emprestimo-description",
    categorySlug: "emprestimo",
    ruleType: CategorizationRuleType.description_contains,
    conditions: { value: "CREDIARIO ITAU" },
    priority: 860,
    confidence: 94,
  },
  {
    slug: "marketing-medium",
    idBase: "rule-marketing-medium",
    categorySlug: "marketing",
    ruleType: CategorizationRuleType.description_contains,
    conditions: { value: "META ADS" },
    priority: 700,
    confidence: 72,
  },
  {
    slug: "outros-low",
    idBase: "rule-outros-low",
    categorySlug: "outros",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "MERCADO CENTRAL" },
    priority: 520,
    confidence: 45,
  },
  {
    slug: "fornecedor-conflict",
    idBase: "rule-fornecedor-conflict",
    categorySlug: "fornecedor",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "ACME CLOUD" },
    priority: 930,
    confidence: 95,
  },
  {
    slug: "software-conflict",
    idBase: "rule-software-conflict",
    categorySlug: "software",
    ruleType: CategorizationRuleType.description_contains,
    conditions: { value: "CLOUD" },
    priority: 925,
    confidence: 94,
  },
  {
    slug: "legacy-inactive",
    idBase: "rule-legacy-inactive",
    categorySlug: "software-legado",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "ERP LEGACY" },
    priority: 915,
    confidence: 96,
  },
  {
    slug: "incompatible-income",
    idBase: "rule-incompatible-income",
    categorySlug: "vendas",
    ruleType: CategorizationRuleType.counterparty_contains,
    conditions: { value: "RECEITA ERRADA" },
    priority: 914,
    confidence: 96,
  },
  {
    slug: "parcela-cartao",
    idBase: "rule-parcela-cartao",
    categorySlug: "cartao",
    ruleType: CategorizationRuleType.description_contains,
    conditions: { value: "NOTEBOOK PARCELA" },
    priority: 855,
    confidence: 91,
  },
] as const;

function scopedId(companyId: string, idBase: string): string {
  return companyId === demoCompanyId ? idBase : `${companyId}-${idBase}`;
}

export function demoCategoryId(companyId: string, slug: string): string {
  const category = demoCategoryDefinitions.find((value) => value.slug === slug);
  if (!category) {
    throw new Error(`Unknown demo category slug: ${slug}`);
  }
  return scopedId(companyId, category.idBase);
}

export function demoRuleId(companyId: string, slug: string): string {
  const rule = demoRuleDefinitions.find((value) => value.slug === slug);
  if (!rule) {
    throw new Error(`Unknown demo rule slug: ${slug}`);
  }
  return scopedId(companyId, rule.idBase);
}

export interface DemoResetSummary {
  companyIds: string[];
  deleted: Record<string, number>;
}

export async function ensureDemoSeed(client: PrismaClient = prisma): Promise<void> {
  for (const companyDefinition of demoCompanies) {
    const company = await client.company.upsert({
      where: { id: companyDefinition.id },
      create: {
        id: companyDefinition.id,
        name: companyDefinition.name,
      },
      update: {
        name: companyDefinition.name,
      },
    });

    for (const user of demoUsers) {
      await client.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email,
          name: user.name,
          passwordHash: "demo-password-hash",
        },
        update: {
          email: user.email,
          name: user.name,
          passwordHash: "demo-password-hash",
        },
      });

      await client.companyMembership.upsert({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: company.id,
          },
        },
        create: {
          userId: user.id,
          companyId: company.id,
          role: user.role,
        },
        update: {
          role: user.role,
        },
      });
    }

    for (const bankAccount of companyDefinition.bankAccounts) {
      await client.bankAccount.upsert({
        where: { id: bankAccount.id },
        create: {
          id: bankAccount.id,
          companyId: company.id,
          bankName: bankAccount.bankName,
          agency: bankAccount.agency,
          accountNumberMasked: bankAccount.accountNumberMasked,
        },
        update: {
          companyId: company.id,
          bankName: bankAccount.bankName,
          agency: bankAccount.agency,
          accountNumberMasked: bankAccount.accountNumberMasked,
        },
      });
    }

    await client.baseScenario.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        name: "Base",
      },
      update: {
        name: "Base",
      },
    });

    for (const category of demoCategoryDefinitions) {
      await client.category.upsert({
        where: {
          companyId_name: {
            companyId: company.id,
            name: category.name,
          },
        },
        create: {
          id: demoCategoryId(company.id, category.slug),
          companyId: company.id,
          name: category.name,
          expectedTransactionType: category.expectedTransactionType,
          isActive: category.isActive ?? true,
        },
        update: {
          expectedTransactionType: category.expectedTransactionType,
          isActive: category.isActive ?? true,
        },
      });
    }

    for (const rule of demoRuleDefinitions) {
      await client.categorizationRule.upsert({
        where: {
          id: demoRuleId(company.id, rule.slug),
        },
        create: {
          id: demoRuleId(company.id, rule.slug),
          companyId: company.id,
          categoryId: demoCategoryId(company.id, rule.categorySlug),
          ruleType: rule.ruleType,
          conditions: rule.conditions,
          priority: rule.priority,
          confidence: rule.confidence,
          source: CategorizationRuleSource.manual,
          status: CategorizationRuleStatus.active,
        },
        update: {
          companyId: company.id,
          categoryId: demoCategoryId(company.id, rule.categorySlug),
          ruleType: rule.ruleType,
          conditions: rule.conditions,
          priority: rule.priority,
          confidence: rule.confidence,
          source: CategorizationRuleSource.manual,
          status: CategorizationRuleStatus.active,
        },
      });
    }
  }
}

export async function resetDemoOperationalData(
  client: PrismaClient = prisma,
  companyIds: readonly string[] = demoCompanyIds,
): Promise<DemoResetSummary> {
  const where = { companyId: { in: [...companyIds] } };
  const deleted: DemoResetSummary["deleted"] = {};

  deleted.projectedCashflowItem = await client.projectedCashflowItem.deleteMany({ where }).then((result) => result.count);
  deleted.auditEvent = await client.auditEvent.deleteMany({ where }).then((result) => result.count);
  deleted.pendingItem = await client.pendingItem.deleteMany({ where }).then((result) => result.count);
  deleted.duplicateCandidate = await client.duplicateCandidate.deleteMany({ where }).then((result) => result.count);
  deleted.approvedRecurrence = await client.approvedRecurrence.deleteMany({ where }).then((result) => result.count);
  deleted.recurrenceSuggestionTransaction = await client.recurrenceSuggestionTransaction.deleteMany({ where }).then((result) => result.count);
  deleted.recurrenceSuggestion = await client.recurrenceSuggestion.deleteMany({ where }).then((result) => result.count);
  deleted.categorizationSuggestion = await client.categorizationSuggestion.deleteMany({ where }).then((result) => result.count);
  deleted.importedTransactionRaw = await client.importedTransactionRaw.deleteMany({ where }).then((result) => result.count);
  deleted.importIssue = await client.importIssue.deleteMany({ where }).then((result) => result.count);
  deleted.bankImport = await client.bankImport.deleteMany({ where }).then((result) => result.count);
  deleted.transaction = await client.transaction.deleteMany({ where }).then((result) => result.count);
  deleted.uploadedFile = await client.uploadedFile.deleteMany({ where }).then((result) => result.count);

  return {
    companyIds: [...companyIds],
    deleted,
  };
}

export function demoUploadDirectories(projectRoot = process.cwd()): string[] {
  return demoCompanyIds.map((companyId) =>
    path.join(projectRoot, "storage", "uploads", companyId),
  );
}

export async function clearDemoUploadDirectories(projectRoot = process.cwd()): Promise<void> {
  for (const directory of demoUploadDirectories(projectRoot)) {
    await rm(directory, { recursive: true, force: true });
  }
}
