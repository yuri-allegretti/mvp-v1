import {
  CategorizationRuleSource,
  CategorizationRuleStatus,
  CategorizationRuleType,
  ExpectedTransactionType,
  PrismaClient,
  Role,
} from "@prisma/client";

const prisma = new PrismaClient();

const companyId = "demo-company";
const bankAccountId = "demo-itau-account";

const users = [
  {
    id: "demo-admin",
    email: "admin@zelo.local",
    name: "Admin Demo",
    role: Role.admin,
  },
  {
    id: "demo-accountant",
    email: "accountant@zelo.local",
    name: "Accountant Demo",
    role: Role.accountant,
  },
  {
    id: "demo-viewer",
    email: "viewer@zelo.local",
    name: "Viewer Demo",
    role: Role.viewer,
  },
] as const;

const categories = [
  ["cat-vendas", "Vendas", ExpectedTransactionType.income],
  ["cat-aluguel", "Aluguel", ExpectedTransactionType.expense],
  ["cat-folha", "Folha", ExpectedTransactionType.expense],
  ["cat-impostos", "Impostos", ExpectedTransactionType.expense],
  ["cat-software", "Software", ExpectedTransactionType.expense],
  ["cat-fornecedor", "Fornecedor", ExpectedTransactionType.expense],
  ["cat-marketing", "Marketing", ExpectedTransactionType.expense],
  ["cat-emprestimo", "Empréstimo", ExpectedTransactionType.both],
  ["cat-transferencia-interna", "Transferência interna", ExpectedTransactionType.both],
  ["cat-outros", "Outros", ExpectedTransactionType.both],
] as const;

async function main() {
  const company = await prisma.company.upsert({
    where: { id: companyId },
    create: {
      id: companyId,
      name: "Empresa Demo",
    },
    update: {
      name: "Empresa Demo",
    },
  });

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        passwordHash: "demo-password-hash",
      },
      update: {
        name: user.name,
      },
    });

    await prisma.companyMembership.upsert({
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

  await prisma.bankAccount.upsert({
    where: { id: bankAccountId },
    create: {
      id: bankAccountId,
      companyId: company.id,
      bankName: "Itaú",
      agency: "0001",
      accountNumberMasked: "****1234",
    },
    update: {
      bankName: "Itaú",
      agency: "0001",
      accountNumberMasked: "****1234",
    },
  });

  await prisma.baseScenario.upsert({
    where: { companyId: company.id },
    create: {
      companyId: company.id,
      name: "Base",
    },
    update: {
      name: "Base",
    },
  });

  for (const [id, name, expectedTransactionType] of categories) {
    await prisma.category.upsert({
      where: {
        companyId_name: {
          companyId: company.id,
          name,
        },
      },
      create: {
        id,
        companyId: company.id,
        name,
        expectedTransactionType,
      },
      update: {
        expectedTransactionType,
        isActive: true,
      },
    });
  }

  const rules = [
    {
      id: "rule-aluguel-counterparty",
      categoryId: "cat-aluguel",
      ruleType: CategorizationRuleType.counterparty_contains,
      conditions: { value: "IMOBILIARIA" },
      priority: 900,
      confidence: 92,
    },
    {
      id: "rule-software-description",
      categoryId: "cat-software",
      ruleType: CategorizationRuleType.description_contains,
      conditions: { value: "SOFTWARE" },
      priority: 700,
      confidence: 80,
    },
    {
      id: "rule-fornecedor-counterparty-amount",
      categoryId: "cat-fornecedor",
      ruleType: CategorizationRuleType.counterparty_and_amount_range,
      conditions: {
        counterparty: "FORNECEDOR DEMO",
        min: 100,
        max: 5000,
      },
      priority: 650,
      confidence: 78,
    },
    {
      id: "rule-impostos-document",
      categoryId: "cat-impostos",
      ruleType: CategorizationRuleType.document_equals,
      conditions: { value: "00000000000000" },
      priority: 950,
      confidence: 96,
    },
    {
      id: "rule-impostos-iof-description",
      categoryId: "cat-impostos",
      ruleType: CategorizationRuleType.description_contains,
      conditions: { value: "IOF" },
      priority: 920,
      confidence: 94,
    },
    {
      id: "rule-fornecedor-copel-counterparty",
      categoryId: "cat-fornecedor",
      ruleType: CategorizationRuleType.counterparty_contains,
      conditions: { value: "COPEL" },
      priority: 760,
      confidence: 91,
    },
  ] as const;

  for (const rule of rules) {
    await prisma.categorizationRule.upsert({
      where: { id: rule.id },
      create: {
        id: rule.id,
        companyId: company.id,
        categoryId: rule.categoryId,
        ruleType: rule.ruleType,
        conditions: rule.conditions,
        priority: rule.priority,
        confidence: rule.confidence,
        source: CategorizationRuleSource.manual,
        status: CategorizationRuleStatus.active,
      },
      update: {
        categoryId: rule.categoryId,
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

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
