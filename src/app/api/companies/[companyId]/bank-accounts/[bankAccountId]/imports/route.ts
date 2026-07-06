import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BankImportIntegrationError,
  importUploadedBankStatement,
} from "@/modules/import";

export const runtime = "nodejs";

interface RouteParams {
  companyId: string;
  bankAccountId: string;
}

function sanitizeStorageFileName(fileName: string): string {
  const baseName = path.basename(fileName).replace(/[\u0000-\u001f\u007f]/g, "");
  return (
    baseName
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "bank-statement"
  );
}

async function routeParams(context: {
  params: RouteParams | Promise<RouteParams>;
}): Promise<RouteParams> {
  return context.params;
}

export async function POST(
  request: Request,
  context: { params: RouteParams | Promise<RouteParams> },
) {
  const uploadedByUserId = request.headers.get("x-user-id");
  if (!uploadedByUserId) {
    return Response.json({ error: "x-user-id header is required" }, { status: 401 });
  }

  const params = await routeParams(context);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "file field is required" }, { status: 400 });
  }

  const uploadDirectory = path.join(
    process.cwd(),
    "storage",
    "uploads",
    params.companyId,
  );
  await mkdir(uploadDirectory, { recursive: true });

  const originalFileName = sanitizeStorageFileName(file.name);
  const storagePath = path.join(uploadDirectory, `${randomUUID()}-${originalFileName}`);
  await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));

  try {
    const result = await importUploadedBankStatement({
      companyId: params.companyId,
      bankAccountId: params.bankAccountId,
      uploadedByUserId,
      filePath: storagePath,
      originalFileName,
      mimeType: file.type || undefined,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BankImportIntegrationError) {
      const status = error.code === "IMPORT_FORBIDDEN" ? 403 : 404;
      return Response.json({ error: error.code, message: error.message }, { status });
    }

    return Response.json(
      { error: "IMPORT_FAILED", message: "Não foi possível importar o extrato." },
      { status: 500 },
    );
  }
}
