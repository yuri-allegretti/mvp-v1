-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'accountant', 'viewer');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "ExpectedTransactionType" AS ENUM ('income', 'expense', 'both');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('itau_xls', 'itau_xlsx', 'itau_pdf', 'csv');

-- CreateEnum
CREATE TYPE "BankImportStatus" AS ENUM ('success', 'partial_success', 'failed');

-- CreateEnum
CREATE TYPE "ImportedTransactionRawStatus" AS ENUM ('imported', 'duplicate', 'invalid', 'ignored');

-- CreateEnum
CREATE TYPE "ImportIssueSeverity" AS ENUM ('error', 'warning');

-- CreateEnum
CREATE TYPE "ConfidenceBand" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "CategorizationSuggestionStatus" AS ENUM ('generated', 'applied', 'accepted', 'corrected', 'rejected', 'superseded');

-- CreateEnum
CREATE TYPE "CategorizationRuleType" AS ENUM ('document_equals', 'counterparty_equals', 'counterparty_contains', 'description_contains', 'description_equals', 'amount_range', 'counterparty_and_amount_range');

-- CreateEnum
CREATE TYPE "CategorizationRuleSource" AS ENUM ('manual', 'correction_history', 'system');

-- CreateEnum
CREATE TYPE "CategorizationRuleStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "PendingStatus" AS ENUM ('open', 'in_review', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "PendingSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "DecisionMode" AS ENUM ('automatic', 'accepted', 'corrected', 'rejected', 'undefined_decision');

-- CreateEnum
CREATE TYPE "DuplicateDecision" AS ENUM ('duplicate_confirmed', 'not_duplicate', 'allowed_exception');

-- CreateEnum
CREATE TYPE "RecurrenceSuggestionStatus" AS ENUM ('pending', 'approved', 'rejected', 'edited');

-- CreateEnum
CREATE TYPE "RecurrenceStatus" AS ENUM ('active', 'paused', 'ended', 'rejected');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('monthly', 'weekly', 'biweekly', 'yearly', 'unknown');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('fixed', 'variable');

-- CreateEnum
CREATE TYPE "RecurrencePatternKind" AS ENUM ('monthly_fixed', 'monthly_variable', 'weekly_recurring', 'biweekly_recurring', 'installment', 'frequent_supplier', 'recurring_income', 'irregular_business_recurring');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "agency" TEXT,
    "accountNumberMasked" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "uploadedFileId" TEXT,
    "sourceFileId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "detectedBank" TEXT NOT NULL,
    "detectedFormat" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "layoutVersion" TEXT NOT NULL,
    "externalIdVersion" TEXT NOT NULL,
    "importPipelineVersion" TEXT NOT NULL,
    "periodStart" DATE,
    "periodEnd" DATE,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "parsedRows" INTEGER NOT NULL DEFAULT 0,
    "ignoredRows" INTEGER NOT NULL DEFAULT 0,
    "importedTransactions" INTEGER NOT NULL DEFAULT 0,
    "duplicateTransactions" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "status" "BankImportStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedTransactionRaw" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankImportId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "transactionId" TEXT,
    "source" "ImportSource" NOT NULL,
    "sourceRowNumber" INTEGER,
    "date" DATE,
    "description" TEXT,
    "amount" DECIMAL(18,2),
    "type" "TransactionType",
    "balanceAfter" DECIMAL(18,2),
    "externalId" TEXT,
    "counterpartyName" TEXT,
    "documentNumber" TEXT,
    "rawData" JSONB NOT NULL,
    "status" "ImportedTransactionRawStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedTransactionRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankImportId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "ImportIssueSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "rawValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "counterpartyName" TEXT,
    "documentNumber" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expectedTransactionType" "ExpectedTransactionType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizationRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "ruleType" "CategorizationRuleType" NOT NULL,
    "conditions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "status" "CategorizationRuleStatus" NOT NULL DEFAULT 'active',
    "source" "CategorizationRuleSource" NOT NULL,
    "createdFromAuditEventId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizationSuggestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "suggestedCategoryId" TEXT NOT NULL,
    "ruleId" TEXT,
    "evaluationId" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidenceBand" "ConfidenceBand" NOT NULL,
    "origin" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "status" "CategorizationSuggestionStatus" NOT NULL DEFAULT 'generated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorizationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "PendingStatus" NOT NULL DEFAULT 'open',
    "severity" "PendingSeverity" NOT NULL,
    "transactionId" TEXT,
    "suggestionId" TEXT,
    "recurrenceSuggestionId" TEXT,
    "duplicateCandidateId" TEXT,
    "deduplicationKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "assignedToUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "candidateTransactionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL,
    "decision" "DuplicateDecision",
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurrenceSuggestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "type" "TransactionType" NOT NULL,
    "representativeDescription" TEXT NOT NULL,
    "normalizedDescription" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "recurrenceType" "RecurrenceType" NOT NULL,
    "patternKind" "RecurrencePatternKind",
    "averageAmount" DECIMAL(18,2) NOT NULL,
    "estimatedNextAmount" DECIMAL(18,2) NOT NULL,
    "amountVariationPercent" DECIMAL(8,4) NOT NULL,
    "expectedNextDate" DATE,
    "confidenceScore" INTEGER NOT NULL,
    "status" "RecurrenceSuggestionStatus" NOT NULL DEFAULT 'pending',
    "evidence" JSONB NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "installmentCount" INTEGER,
    "deduplicationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurrenceSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurrenceSuggestionTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recurrenceSuggestionId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurrenceSuggestionTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedRecurrence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recurrenceSuggestionId" TEXT,
    "categoryId" TEXT,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "recurrenceType" "RecurrenceType" NOT NULL,
    "estimatedAmount" DECIMAL(18,2) NOT NULL,
    "expectedDay" INTEGER,
    "nextDate" DATE,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "installmentCount" INTEGER,
    "status" "RecurrenceStatus" NOT NULL DEFAULT 'active',
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovedRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseScenario" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Base',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaseScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectedCashflowItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "baseScenarioId" TEXT NOT NULL,
    "approvedRecurrenceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectedCashflowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "transactionId" TEXT,
    "suggestionId" TEXT,
    "recurrenceSuggestionId" TEXT,
    "approvedRecurrenceId" TEXT,
    "ruleId" TEXT,
    "previousCategoryId" TEXT,
    "finalCategoryId" TEXT,
    "decisionMode" "DecisionMode",
    "reason" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "CompanyMembership_companyId_role_idx" ON "CompanyMembership"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMembership_userId_companyId_key" ON "CompanyMembership"("userId", "companyId");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_id_companyId_key" ON "BankAccount"("id", "companyId");

-- CreateIndex
CREATE INDEX "UploadedFile_companyId_createdAt_idx" ON "UploadedFile"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadedFile_uploadedByUserId_idx" ON "UploadedFile"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "BankImport_companyId_bankAccountId_createdAt_idx" ON "BankImport"("companyId", "bankAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "BankImport_sourceFileId_idx" ON "BankImport"("sourceFileId");

-- CreateIndex
CREATE INDEX "BankImport_uploadedFileId_idx" ON "BankImport"("uploadedFileId");

-- CreateIndex
CREATE UNIQUE INDEX "BankImport_id_companyId_key" ON "BankImport"("id", "companyId");

-- CreateIndex
CREATE INDEX "ImportedTransactionRaw_bankImportId_idx" ON "ImportedTransactionRaw"("bankImportId");

-- CreateIndex
CREATE INDEX "ImportedTransactionRaw_companyId_bankAccountId_externalId_idx" ON "ImportedTransactionRaw"("companyId", "bankAccountId", "externalId");

-- CreateIndex
CREATE INDEX "ImportedTransactionRaw_transactionId_idx" ON "ImportedTransactionRaw"("transactionId");

-- CreateIndex
CREATE INDEX "ImportIssue_companyId_bankImportId_severity_idx" ON "ImportIssue"("companyId", "bankImportId", "severity");

-- CreateIndex
CREATE INDEX "Transaction_companyId_bankAccountId_date_idx" ON "Transaction"("companyId", "bankAccountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_companyId_categoryId_idx" ON "Transaction"("companyId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_companyId_key" ON "Transaction"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_companyId_bankAccountId_externalId_key" ON "Transaction"("companyId", "bankAccountId", "externalId");

-- CreateIndex
CREATE INDEX "Category_companyId_isActive_idx" ON "Category"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_companyId_key" ON "Category"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");

-- CreateIndex
CREATE INDEX "CategorizationRule_companyId_status_priority_idx" ON "CategorizationRule"("companyId", "status", "priority");

-- CreateIndex
CREATE INDEX "CategorizationRule_companyId_categoryId_idx" ON "CategorizationRule"("companyId", "categoryId");

-- CreateIndex
CREATE INDEX "CategorizationRule_createdFromAuditEventId_idx" ON "CategorizationRule"("createdFromAuditEventId");

-- CreateIndex
CREATE UNIQUE INDEX "CategorizationRule_id_companyId_key" ON "CategorizationRule"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CategorizationSuggestion_deduplicationKey_key" ON "CategorizationSuggestion"("deduplicationKey");

-- CreateIndex
CREATE INDEX "CategorizationSuggestion_companyId_transactionId_createdAt_idx" ON "CategorizationSuggestion"("companyId", "transactionId", "createdAt");

-- CreateIndex
CREATE INDEX "CategorizationSuggestion_companyId_evaluationId_idx" ON "CategorizationSuggestion"("companyId", "evaluationId");

-- CreateIndex
CREATE INDEX "CategorizationSuggestion_companyId_ruleId_idx" ON "CategorizationSuggestion"("companyId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "CategorizationSuggestion_id_companyId_key" ON "CategorizationSuggestion"("id", "companyId");

-- CreateIndex
CREATE INDEX "PendingItem_companyId_type_status_createdAt_idx" ON "PendingItem"("companyId", "type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PendingItem_companyId_transactionId_idx" ON "PendingItem"("companyId", "transactionId");

-- CreateIndex
CREATE INDEX "PendingItem_companyId_suggestionId_idx" ON "PendingItem"("companyId", "suggestionId");

-- CreateIndex
CREATE INDEX "PendingItem_companyId_recurrenceSuggestionId_idx" ON "PendingItem"("companyId", "recurrenceSuggestionId");

-- CreateIndex
CREATE INDEX "PendingItem_companyId_duplicateCandidateId_idx" ON "PendingItem"("companyId", "duplicateCandidateId");

-- CreateIndex
CREATE INDEX "PendingItem_deduplicationKey_status_idx" ON "PendingItem"("deduplicationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pending_item_actionable_deduplication_key" ON "PendingItem"("companyId", "deduplicationKey") WHERE "status" IN ('open', 'in_review');

-- CreateIndex
CREATE UNIQUE INDEX "PendingItem_id_companyId_key" ON "PendingItem"("id", "companyId");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_companyId_createdAt_idx" ON "DuplicateCandidate"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_decidedByUserId_idx" ON "DuplicateCandidate"("decidedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateCandidate_id_companyId_key" ON "DuplicateCandidate"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateCandidate_companyId_transactionId_candidateTransac_key" ON "DuplicateCandidate"("companyId", "transactionId", "candidateTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurrenceSuggestion_deduplicationKey_key" ON "RecurrenceSuggestion"("deduplicationKey");

-- CreateIndex
CREATE INDEX "RecurrenceSuggestion_companyId_status_createdAt_idx" ON "RecurrenceSuggestion"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RecurrenceSuggestion_companyId_categoryId_idx" ON "RecurrenceSuggestion"("companyId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurrenceSuggestion_id_companyId_key" ON "RecurrenceSuggestion"("id", "companyId");

-- CreateIndex
CREATE INDEX "RecurrenceSuggestionTransaction_companyId_transactionId_idx" ON "RecurrenceSuggestionTransaction"("companyId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurrenceSuggestionTransaction_recurrenceSuggestionId_tran_key" ON "RecurrenceSuggestionTransaction"("recurrenceSuggestionId", "transactionId");

-- CreateIndex
CREATE INDEX "ApprovedRecurrence_companyId_status_idx" ON "ApprovedRecurrence"("companyId", "status");

-- CreateIndex
CREATE INDEX "ApprovedRecurrence_companyId_recurrenceSuggestionId_idx" ON "ApprovedRecurrence"("companyId", "recurrenceSuggestionId");

-- CreateIndex
CREATE INDEX "ApprovedRecurrence_approvedByUserId_idx" ON "ApprovedRecurrence"("approvedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovedRecurrence_id_companyId_key" ON "ApprovedRecurrence"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BaseScenario_companyId_key" ON "BaseScenario"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BaseScenario_id_companyId_key" ON "BaseScenario"("id", "companyId");

-- CreateIndex
CREATE INDEX "ProjectedCashflowItem_companyId_date_idx" ON "ProjectedCashflowItem"("companyId", "date");

-- CreateIndex
CREATE INDEX "ProjectedCashflowItem_companyId_baseScenarioId_idx" ON "ProjectedCashflowItem"("companyId", "baseScenarioId");

-- CreateIndex
CREATE INDEX "ProjectedCashflowItem_companyId_approvedRecurrenceId_idx" ON "ProjectedCashflowItem"("companyId", "approvedRecurrenceId");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_entityType_entityId_createdAt_idx" ON "AuditEvent"("companyId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_createdAt_idx" ON "AuditEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_transactionId_createdAt_idx" ON "AuditEvent"("companyId", "transactionId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_suggestionId_idx" ON "AuditEvent"("companyId", "suggestionId");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_recurrenceSuggestionId_idx" ON "AuditEvent"("companyId", "recurrenceSuggestionId");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_approvedRecurrenceId_idx" ON "AuditEvent"("companyId", "approvedRecurrenceId");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_ruleId_idx" ON "AuditEvent"("companyId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_id_companyId_key" ON "AuditEvent"("id", "companyId");

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImport" ADD CONSTRAINT "BankImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImport" ADD CONSTRAINT "BankImport_bankAccountId_companyId_fkey" FOREIGN KEY ("bankAccountId", "companyId") REFERENCES "BankAccount"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImport" ADD CONSTRAINT "BankImport_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransactionRaw" ADD CONSTRAINT "ImportedTransactionRaw_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransactionRaw" ADD CONSTRAINT "ImportedTransactionRaw_bankImportId_companyId_fkey" FOREIGN KEY ("bankImportId", "companyId") REFERENCES "BankImport"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransactionRaw" ADD CONSTRAINT "ImportedTransactionRaw_bankAccountId_companyId_fkey" FOREIGN KEY ("bankAccountId", "companyId") REFERENCES "BankAccount"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransactionRaw" ADD CONSTRAINT "ImportedTransactionRaw_transactionId_companyId_fkey" FOREIGN KEY ("transactionId", "companyId") REFERENCES "Transaction"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_bankImportId_companyId_fkey" FOREIGN KEY ("bankImportId", "companyId") REFERENCES "BankImport"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bankAccountId_companyId_fkey" FOREIGN KEY ("bankAccountId", "companyId") REFERENCES "BankAccount"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_companyId_fkey" FOREIGN KEY ("categoryId", "companyId") REFERENCES "Category"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_categoryId_companyId_fkey" FOREIGN KEY ("categoryId", "companyId") REFERENCES "Category"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_createdFromAuditEventId_companyId_fkey" FOREIGN KEY ("createdFromAuditEventId", "companyId") REFERENCES "AuditEvent"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationSuggestion" ADD CONSTRAINT "CategorizationSuggestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationSuggestion" ADD CONSTRAINT "CategorizationSuggestion_transactionId_companyId_fkey" FOREIGN KEY ("transactionId", "companyId") REFERENCES "Transaction"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationSuggestion" ADD CONSTRAINT "CategorizationSuggestion_suggestedCategoryId_companyId_fkey" FOREIGN KEY ("suggestedCategoryId", "companyId") REFERENCES "Category"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationSuggestion" ADD CONSTRAINT "CategorizationSuggestion_ruleId_companyId_fkey" FOREIGN KEY ("ruleId", "companyId") REFERENCES "CategorizationRule"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingItem" ADD CONSTRAINT "PendingItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingItem" ADD CONSTRAINT "PendingItem_transactionId_companyId_fkey" FOREIGN KEY ("transactionId", "companyId") REFERENCES "Transaction"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingItem" ADD CONSTRAINT "PendingItem_suggestionId_companyId_fkey" FOREIGN KEY ("suggestionId", "companyId") REFERENCES "CategorizationSuggestion"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingItem" ADD CONSTRAINT "PendingItem_recurrenceSuggestionId_companyId_fkey" FOREIGN KEY ("recurrenceSuggestionId", "companyId") REFERENCES "RecurrenceSuggestion"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingItem" ADD CONSTRAINT "PendingItem_duplicateCandidateId_companyId_fkey" FOREIGN KEY ("duplicateCandidateId", "companyId") REFERENCES "DuplicateCandidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingItem" ADD CONSTRAINT "PendingItem_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingItem" ADD CONSTRAINT "PendingItem_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_transactionId_companyId_fkey" FOREIGN KEY ("transactionId", "companyId") REFERENCES "Transaction"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_candidateTransactionId_companyId_fkey" FOREIGN KEY ("candidateTransactionId", "companyId") REFERENCES "Transaction"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceSuggestion" ADD CONSTRAINT "RecurrenceSuggestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceSuggestion" ADD CONSTRAINT "RecurrenceSuggestion_categoryId_companyId_fkey" FOREIGN KEY ("categoryId", "companyId") REFERENCES "Category"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceSuggestionTransaction" ADD CONSTRAINT "RecurrenceSuggestionTransaction_recurrenceSuggestionId_com_fkey" FOREIGN KEY ("recurrenceSuggestionId", "companyId") REFERENCES "RecurrenceSuggestion"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceSuggestionTransaction" ADD CONSTRAINT "RecurrenceSuggestionTransaction_transactionId_companyId_fkey" FOREIGN KEY ("transactionId", "companyId") REFERENCES "Transaction"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedRecurrence" ADD CONSTRAINT "ApprovedRecurrence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedRecurrence" ADD CONSTRAINT "ApprovedRecurrence_recurrenceSuggestionId_companyId_fkey" FOREIGN KEY ("recurrenceSuggestionId", "companyId") REFERENCES "RecurrenceSuggestion"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedRecurrence" ADD CONSTRAINT "ApprovedRecurrence_categoryId_companyId_fkey" FOREIGN KEY ("categoryId", "companyId") REFERENCES "Category"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedRecurrence" ADD CONSTRAINT "ApprovedRecurrence_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseScenario" ADD CONSTRAINT "BaseScenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectedCashflowItem" ADD CONSTRAINT "ProjectedCashflowItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectedCashflowItem" ADD CONSTRAINT "ProjectedCashflowItem_baseScenarioId_companyId_fkey" FOREIGN KEY ("baseScenarioId", "companyId") REFERENCES "BaseScenario"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectedCashflowItem" ADD CONSTRAINT "ProjectedCashflowItem_approvedRecurrenceId_companyId_fkey" FOREIGN KEY ("approvedRecurrenceId", "companyId") REFERENCES "ApprovedRecurrence"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_transactionId_companyId_fkey" FOREIGN KEY ("transactionId", "companyId") REFERENCES "Transaction"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_suggestionId_companyId_fkey" FOREIGN KEY ("suggestionId", "companyId") REFERENCES "CategorizationSuggestion"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_recurrenceSuggestionId_companyId_fkey" FOREIGN KEY ("recurrenceSuggestionId", "companyId") REFERENCES "RecurrenceSuggestion"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_approvedRecurrenceId_companyId_fkey" FOREIGN KEY ("approvedRecurrenceId", "companyId") REFERENCES "ApprovedRecurrence"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_ruleId_companyId_fkey" FOREIGN KEY ("ruleId", "companyId") REFERENCES "CategorizationRule"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_previousCategoryId_companyId_fkey" FOREIGN KEY ("previousCategoryId", "companyId") REFERENCES "Category"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_finalCategoryId_companyId_fkey" FOREIGN KEY ("finalCategoryId", "companyId") REFERENCES "Category"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

