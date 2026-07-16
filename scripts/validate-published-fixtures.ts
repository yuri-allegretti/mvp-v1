import {
  CategorizationRuleSource,
  CategorizationRuleStatus,
  CategorizationRuleType,
  ExpectedTransactionType,
  Role,
} from "@prisma/client";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { transactionToRecurrenceInput } from "../src/modules/recurrences/adapters/transactionToRecurrenceInput";
import { detectRecurrences } from "../src/modules/recurrences/core/service/recurrenceDetectionService.ts";
import { consolidateCoreRecurrenceSuggestions } from "../src/modules/recurrences/services/recurrenceSuggestionConsolidation";
import {
  confidenceForPublishedRule,
  publishedBroadCategorizationRules,
} from "./support/published-categorization-rules";

const baseUrl = "http://127.0.0.1:3000";
const accountantId = "published-fixture-accountant";
const adminId = "published-fixture-admin";
const viewerId = "published-fixture-viewer";
const root = process.cwd();
const dataset = path.resolve(
  root,
  "..",
  "gerador de testes",
  "zelo-financial-fixture-generator",
  "output",
  "seed-v1",
);

type Company = { id: string; tradeName: string };
type Account = {
  id: string;
  companyId: string;
  bank: string;
  branchCode: string;
  accountNumber: string;
};
type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | "neutral";
};
type Rule = {
  id: string;
  categoryId: string;
  pattern: string;
  conceptualBehavior: "auto_apply" | "review" | "low_confidence";
};
type Expected = {
  summary: {
    totalImportedTransactions: number;
    totalIgnoredNoiseRows: number;
    totalIgnoredFutureRows: number;
    totalDuplicateRows: number;
    expectedTransactionsPerCompany: Record<string, number>;
    expectedTransactionsPerFile: Record<string, number>;
  };
};
type ImportPayload = {
  transactionsCreated?: number;
  duplicatesSkipped?: number;
  rowsIgnored?: number;
};

const companyId = (id: string) => `published-${id}`;
const accountId = (id: string) => `published-${id}`;
const categoryId = (company: string, category: string) =>
  `published-${company}-${category}`;

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(dataset, file), "utf8")) as T;
}

async function clear(ids: string[]): Promise<void> {
  const where = { companyId: { in: ids } };
  await prisma.projectedCashflowItem.deleteMany({ where });
  await prisma.auditEvent.deleteMany({ where });
  await prisma.pendingItem.deleteMany({ where });
  await prisma.duplicateCandidate.deleteMany({ where });
  await prisma.approvedRecurrence.deleteMany({ where });
  await prisma.recurrenceSuggestionTransaction.deleteMany({ where });
  await prisma.recurrenceSuggestion.deleteMany({ where });
  await prisma.categorizationSuggestion.deleteMany({ where });
  await prisma.importedTransactionRaw.deleteMany({ where });
  await prisma.importIssue.deleteMany({ where });
  await prisma.bankImport.deleteMany({ where });
  await prisma.transaction.deleteMany({ where });
  await prisma.uploadedFile.deleteMany({ where });
  await prisma.categorizationRule.deleteMany({ where });
  await prisma.category.deleteMany({ where });
  await prisma.baseScenario.deleteMany({ where });
  await prisma.bankAccount.deleteMany({ where });
  await prisma.companyMembership.deleteMany({ where });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
  for (const id of ids) {
    await rm(path.join(root, "storage", "uploads", id), {
      recursive: true,
      force: true,
    });
  }
}

async function seed(params: {
  companies: Company[];
  accounts: Account[];
  categories: Category[];
  rules: Rule[];
}): Promise<void> {
  const users = [
    { id: accountantId, email: "published-accountant@zelo.local", role: Role.accountant },
    { id: adminId, email: "published-admin@zelo.local", role: Role.admin },
    { id: viewerId, email: "published-viewer@zelo.local", role: Role.viewer },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        name: user.id,
        passwordHash: "fixture-hash",
      },
      update: { email: user.email, name: user.id },
    });
  }
  for (const company of params.companies) {
    const id = companyId(company.id);
    await prisma.company.create({ data: { id, name: company.tradeName } });
    for (const user of users) {
      await prisma.companyMembership.create({
        data: { companyId: id, userId: user.id, role: user.role },
      });
    }
    const account = params.accounts.find((item) => item.companyId === company.id)!;
    await prisma.bankAccount.create({
      data: {
        id: accountId(account.id),
        companyId: id,
        bankName: account.bank,
        agency: account.branchCode,
        accountNumberMasked: account.accountNumber,
      },
    });
    await prisma.baseScenario.create({ data: { companyId: id, name: "Base" } });
    for (const category of params.categories) {
      const expectedTransactionType =
        category.type === "income"
          ? ExpectedTransactionType.income
          : category.type === "expense"
            ? ExpectedTransactionType.expense
            : ExpectedTransactionType.both;
      await prisma.category.create({
        data: {
          id: categoryId(company.id, category.id),
          companyId: id,
          name: category.name,
          expectedTransactionType,
        },
      });
    }
    let priority = 1000;
    for (const rule of params.rules) {
      const confidence =
        rule.conceptualBehavior === "auto_apply"
          ? 95
          : rule.conceptualBehavior === "review"
            ? 75
            : 45;
      for (const token of rule.pattern.split("|").filter(Boolean)) {
        await prisma.categorizationRule.create({
          data: {
            id: `published-${company.id}-${rule.id}-${priority}`,
            companyId: id,
            categoryId: categoryId(company.id, rule.categoryId),
            ruleType: CategorizationRuleType.description_contains,
            conditions: { value: token },
            priority,
            confidence,
            source: CategorizationRuleSource.manual,
            status: CategorizationRuleStatus.active,
          },
        });
        priority -= 1;
      }
    }
    let broadPriority = 900;
    for (const [index, rule] of publishedBroadCategorizationRules.entries()) {
      await prisma.categorizationRule.create({
        data: {
          id: `published-${company.id}-broad-${String(index + 1).padStart(3, "0")}`,
          companyId: id,
          categoryId: categoryId(company.id, rule.categoryId),
          ruleType: CategorizationRuleType.description_contains,
          conditions: { value: rule.pattern },
          priority: broadPriority,
          confidence: confidenceForPublishedRule(rule.behavior),
          source: CategorizationRuleSource.manual,
          status: CategorizationRuleStatus.active,
        },
      });
      broadPriority -= 1;
    }
  }
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`${baseUrl}/dashboard?userId=${accountantId}`).catch(
      () => null,
    );
    if (response?.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server unavailable at ${baseUrl}`);
}

async function upload(params: {
  company: string;
  account: string;
  actor: string;
  file: string;
}): Promise<{ status: number; payload: ImportPayload & Record<string, unknown> }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([await readFile(params.file)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    path.basename(params.file),
  );
  const response = await fetch(
    `${baseUrl}/api/companies/${params.company}/bank-accounts/${params.account}/imports`,
    { method: "POST", headers: { "x-user-id": params.actor }, body: form },
  );
  const body = await response.text();
  return {
    status: response.status,
    payload: body ? (JSON.parse(body) as ImportPayload & Record<string, unknown>) : {},
  };
}

async function main(): Promise<void> {
  await waitForServer();
  const companies = await readJson<Company[]>("companies.json");
  const accounts = await readJson<Account[]>("accounts.json");
  const categories = await readJson<Category[]>("categories.json");
  const rules = await readJson<Rule[]>("categorization-rules.json");
  const expected = await readJson<Expected>(
    "ground-truth/expected-import-behavior.json",
  );
  const ids = companies.map((company) => companyId(company.id));
  await clear(ids);
  await seed({ companies, accounts, categories, rules });

  const results: Array<{
    file: string;
    status: number;
    expected: number;
    actual: number | null;
    duplicates: number | null;
    ignored: number | null;
  }> = [];
  for (const company of companies) {
    const account = accounts.find((item) => item.companyId === company.id)!;
    const directory = path.join(dataset, "statements", company.id);
    const files = (await readdir(directory)).filter((file) => file.endsWith(".xlsx")).sort();
    for (const file of files) {
      const relative = `statements/${company.id}/${file}`;
      const response = await upload({
        company: companyId(company.id),
        account: accountId(account.id),
        actor: accountantId,
        file: path.join(directory, file),
      });
      results.push({
        file: relative,
        status: response.status,
        expected: expected.summary.expectedTransactionsPerFile[relative] ?? -1,
        actual: response.payload.transactionsCreated ?? null,
        duplicates: response.payload.duplicatesSkipped ?? null,
        ignored: response.payload.rowsIgnored ?? null,
      });
      console.error(
        `[${results.length}/120] ${relative}: HTTP ${response.status}, created=${response.payload.transactionsCreated ?? "n/a"}`,
      );
    }
  }

  const first = companies[0];
  const firstAccount = accounts.find((item) => item.companyId === first.id)!;
  const firstFile = path.join(dataset, "statements", first.id, "2025-01-itau.xlsx");
  const reimport = await upload({
    company: companyId(first.id),
    account: accountId(firstAccount.id),
    actor: accountantId,
    file: firstFile,
  });
  const viewerImport = await upload({
    company: companyId(first.id),
    account: accountId(firstAccount.id),
    actor: viewerId,
    file: firstFile,
  });
  const otherAccount = accounts.find((item) => item.companyId === companies[1].id)!;
  const crossCompany = await upload({
    company: companyId(first.id),
    account: accountId(otherAccount.id),
    actor: accountantId,
    file: firstFile,
  });

  const actualPerCompany: Record<string, number> = {};
  for (const company of companies) {
    actualPerCompany[company.id] = await prisma.transaction.count({
      where: { companyId: companyId(company.id) },
    });
  }
  const where = { companyId: { in: ids } };
  const database = {
    transactions: await prisma.transaction.count({ where }),
    importedRaw: await prisma.importedTransactionRaw.count({
      where: { ...where, status: "imported" },
    }),
    duplicateRaw: await prisma.importedTransactionRaw.count({
      where: { ...where, status: "duplicate" },
    }),
    ignoredRaw: await prisma.importedTransactionRaw.count({
      where: { ...where, status: "ignored" },
    }),
    duplicateCandidates: await prisma.duplicateCandidate.count({ where }),
    categorizationSuggestions: await prisma.categorizationSuggestion.count({ where }),
    categorizedTransactions: await prisma.transaction.count({
      where: { ...where, categoryId: { not: null } },
    }),
    transactionsWithCounterparty: await prisma.transaction.count({
      where: { ...where, counterpartyName: { not: null } },
    }),
    transactionsWithDocument: await prisma.transaction.count({
      where: { ...where, documentNumber: { not: null } },
    }),
    activeCategorizationRules: await prisma.categorizationRule.count({
      where: { ...where, status: "active" },
    }),
    pendingItems: await prisma.pendingItem.count({ where }),
    actionablePendingItems: await prisma.pendingItem.count({
      where: { ...where, status: { in: ["open", "in_review"] } },
    }),
    uncategorizedPending: await prisma.pendingItem.count({
      where: {
        ...where,
        type: "uncategorized_transaction",
        status: { in: ["open", "in_review"] },
      },
    }),
    categorizationReviewPending: await prisma.pendingItem.count({
      where: {
        ...where,
        type: "categorization_review",
        status: { in: ["open", "in_review"] },
      },
    }),
    categorizationLowConfidencePending: await prisma.pendingItem.count({
      where: {
        ...where,
        type: "categorization_low_confidence",
        status: { in: ["open", "in_review"] },
      },
    }),
    categorizationConflictPending: await prisma.pendingItem.count({
      where: {
        ...where,
        type: "categorization_conflict",
        status: { in: ["open", "in_review"] },
      },
    }),
    possibleDuplicatePending: await prisma.pendingItem.count({
      where: {
        ...where,
        type: "possible_duplicate",
        status: { in: ["open", "in_review"] },
      },
    }),
    recurrenceSuggestions: await prisma.recurrenceSuggestion.count({ where }),
    actionableRecurrenceSuggestions: await prisma.recurrenceSuggestion.count({
      where: { ...where, status: { in: ["pending", "edited"] } },
    }),
    actionableRecurrenceSuggestionsWithoutPending: await prisma.recurrenceSuggestion.count({
      where: {
        ...where,
        status: { in: ["pending", "edited"] },
        pendingItems: {
          none: { type: "recurrence_approval", status: { in: ["open", "in_review"] } },
        },
      },
    }),
    nonActionableRecurrenceSuggestionsWithPending: await prisma.recurrenceSuggestion.count({
      where: {
        ...where,
        status: { notIn: ["pending", "edited"] },
        pendingItems: {
          some: { type: "recurrence_approval", status: { in: ["open", "in_review"] } },
        },
      },
    }),
    supersededRecurrenceSuggestions: await prisma.recurrenceSuggestion.count({
      where: { ...where, status: "superseded" },
    }),
    recurrenceApprovalPending: await prisma.pendingItem.count({
      where: { ...where, type: "recurrence_approval" },
    }),
    actionableRecurrenceApprovalPending: await prisma.pendingItem.count({
      where: {
        ...where,
        type: "recurrence_approval",
        status: { in: ["open", "in_review"] },
      },
    }),
    auditEvents: await prisma.auditEvent.count({ where }),
  };
  let finalRawSuggestions = 0;
  let finalConsolidatedSuggestions = 0;
  for (const id of companies.map((company) => companyId(company.id))) {
    const transactions = await prisma.transaction.findMany({
      where: { companyId: id },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    const raw = detectRecurrences(transactions.map(transactionToRecurrenceInput));
    finalRawSuggestions += raw.length;
    finalConsolidatedSuggestions += consolidateCoreRecurrenceSuggestions(
      raw,
      new Map(transactions.map((transaction) => [transaction.id, transaction])),
    ).length;
  }
  const recurrenceValidation = {
    finalRawSuggestions,
    finalConsolidatedSuggestions,
    persistedConsolidationDelta:
      finalConsolidatedSuggestions - database.actionableRecurrenceSuggestions,
    actionableSuggestionsDoNotExceedFinalConsolidation:
      database.actionableRecurrenceSuggestions <= finalConsolidatedSuggestions,
    onePendingPerActionableSuggestion:
      database.actionableRecurrenceApprovalPending === database.actionableRecurrenceSuggestions &&
      database.actionableRecurrenceSuggestionsWithoutPending === 0 &&
      database.nonActionableRecurrenceSuggestionsWithPending === 0,
  };
  const categorizationValidation = {
    broadRulesPerCompany: publishedBroadCategorizationRules.length,
    activeRulesPerCompany: database.activeCategorizationRules / companies.length,
    uncategorizedBelow250: database.uncategorizedPending < 250,
    uncategorizedReductionPercent: Number(
      (((1067 - database.uncategorizedPending) / 1067) * 100).toFixed(1),
    ),
  };
  const mismatches = results.filter(
    (result) => result.status !== 201 || result.actual !== result.expected,
  );
  console.log(
    JSON.stringify(
      {
        importValidation: {
          filesAttempted: results.length,
          successfulHttpImports: results.filter((result) => result.status === 201).length,
          exactPerFileMatches: results.length - mismatches.length,
          mismatchCount: mismatches.length,
          mismatches: mismatches.slice(0, 25),
          expectedTotalTransactions: expected.summary.totalImportedTransactions,
          actualTotalTransactions: database.transactions,
          expectedPerCompany: expected.summary.expectedTransactionsPerCompany,
          actualPerCompany,
        },
        idempotency: {
          status: reimport.status,
          transactionsCreated: reimport.payload.transactionsCreated ?? null,
          duplicatesSkipped: reimport.payload.duplicatesSkipped ?? null,
        },
        authorization: {
          viewerImportStatus: viewerImport.status,
          crossCompanyAccountStatus: crossCompany.status,
        },
        expected: expected.summary,
        database,
        categorizationValidation,
        recurrenceValidation,
      },
      null,
      2,
    ),
  );
  const failures = [
    ...(mismatches.length > 0 ? [`${mismatches.length} importacoes divergentes`] : []),
    ...(database.transactions !== expected.summary.totalImportedTransactions
      ? [
          `transactions=${database.transactions}, esperado=${expected.summary.totalImportedTransactions}`,
        ]
      : []),
    ...(reimport.status !== 201 || reimport.payload.transactionsCreated !== 0
      ? ["reimportacao nao idempotente"]
      : []),
    ...(viewerImport.status !== 403 ? [`viewer retornou ${viewerImport.status}`] : []),
    ...(crossCompany.status !== 404
      ? [`cross-company retornou ${crossCompany.status}`]
      : []),
    ...(!categorizationValidation.uncategorizedBelow250
      ? [`uncategorized=${database.uncategorizedPending}, meta < 250`]
      : []),
    ...(!recurrenceValidation.onePendingPerActionableSuggestion
      ? ["invariante de pendencia acionavel de recorrencia violada"]
      : []),
  ];
  if (failures.length > 0) {
    throw new Error(`Published fixture validation failed: ${failures.join("; ")}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
