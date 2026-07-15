import type { PrismaClient, Role } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { can } from "../../lib/rbac";
import { prisma } from "../../lib/prisma";
import { importAndPersistBankStatement } from "./core/importAndPersistBankStatement";
import { PrismaImportPersistenceStore } from "./core/persistence/prismaImportPersistenceStore";
import type { ImportAndPersistBankStatementResult } from "./core/importAndPersistBankStatement";
import {
  runPostImportProcessing,
  type PostImportProcessingSummary,
} from "./services/postImportProcessingWorkflow";

export type BankImportIntegrationErrorCode =
  | "IMPORT_FORBIDDEN"
  | "BANK_ACCOUNT_NOT_FOUND"
  | "UPLOADED_FILE_NOT_FOUND";

export class BankImportIntegrationError extends Error {
  constructor(
    readonly code: BankImportIntegrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BankImportIntegrationError";
  }
}

export interface ImportUploadedBankStatementParams {
  companyId: string;
  bankAccountId: string;
  uploadedByUserId: string;
  filePath: string;
  originalFileName?: string;
  mimeType?: string;
}

export interface ImportUploadedBankStatementResult
  extends ImportAndPersistBankStatementResult {
  uploadedFileId: string;
  categorizationTriggered: true;
  postProcessing: PostImportProcessingSummary;
}

async function assertCanImport(params: {
  client: PrismaClient;
  companyId: string;
  bankAccountId: string;
  uploadedByUserId: string;
}): Promise<Role> {
  const membership = await params.client.companyMembership.findUnique({
    where: {
      userId_companyId: {
        userId: params.uploadedByUserId,
        companyId: params.companyId,
      },
    },
    select: { role: true },
  });

  if (!membership || !can(membership.role, "import:create")) {
    throw new BankImportIntegrationError(
      "IMPORT_FORBIDDEN",
      "O usuário não tem permissão para importar extratos nesta empresa.",
    );
  }

  const bankAccount = await params.client.bankAccount.findFirst({
    where: {
      id: params.bankAccountId,
      companyId: params.companyId,
    },
    select: { id: true },
  });

  if (!bankAccount) {
    throw new BankImportIntegrationError(
      "BANK_ACCOUNT_NOT_FOUND",
      "A conta bancária não pertence à empresa informada.",
    );
  }

  return membership.role;
}

function extensionMimeType(fileName: string): string | undefined {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".xls") return "application/vnd.ms-excel";
  if (extension === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return undefined;
}

export async function importUploadedBankStatement(
  params: ImportUploadedBankStatementParams,
  client: PrismaClient = prisma,
): Promise<ImportUploadedBankStatementResult> {
  await assertCanImport({ ...params, client });

  const fileStats = await stat(params.filePath).catch(() => null);
  if (!fileStats?.isFile()) {
    throw new BankImportIntegrationError(
      "UPLOADED_FILE_NOT_FOUND",
      "O arquivo enviado não foi encontrado.",
    );
  }

  const buffer = await readFile(params.filePath);
  const originalFileName = params.originalFileName ?? path.basename(params.filePath);
  const uploadedFile = await client.uploadedFile.create({
    data: {
      companyId: params.companyId,
      uploadedByUserId: params.uploadedByUserId,
      originalFileName,
      storagePath: params.filePath,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      mimeType: params.mimeType ?? extensionMimeType(originalFileName),
      sizeBytes: fileStats.size,
    },
    select: { id: true },
  });

  const result = await importAndPersistBankStatement(
    {
      filePath: params.filePath,
      companyId: params.companyId,
      bankAccountId: params.bankAccountId,
      sourceFileId: uploadedFile.id,
      originalFileName,
    },
    new PrismaImportPersistenceStore(client),
  );

  const postProcessing = await runPostImportProcessing(
    {
      companyId: params.companyId,
      bankAccountId: params.bankAccountId,
      actorUserId: params.uploadedByUserId,
      bankImportId: result.bankImportId,
    },
    client,
  );

  return {
    ...result,
    uploadedFileId: uploadedFile.id,
    categorizationTriggered: true,
    postProcessing,
  };
}
