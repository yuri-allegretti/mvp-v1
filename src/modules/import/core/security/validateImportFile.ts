import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ImportFileError } from "../errors";
import type { DetectedFormat } from "../types";
import { detectFileType } from "./detectFileType";

export const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".xls", ".xlsx", ".pdf"]);

export interface ValidatedImportFile {
  buffer: Buffer;
  detectedFormat: Exclude<DetectedFormat, "unknown">;
  sanitizedFileName: string;
  sizeBytes: number;
}

export function sanitizeOriginalFileName(fileName: string): string {
  const baseName = path.basename(fileName).replace(/[\u0000-\u001f\u007f]/g, "");
  const sanitized = baseName
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return sanitized || "bank-statement";
}

export async function validateImportFile(params: {
  filePath: string;
  originalFileName?: string;
  maxFileSizeBytes?: number;
}): Promise<ValidatedImportFile> {
  const displayName = sanitizeOriginalFileName(
    params.originalFileName ?? path.basename(params.filePath),
  );
  const extension = path.extname(displayName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new ImportFileError(
      "UNSUPPORTED_EXTENSION",
      "A extensão do arquivo não é suportada. Use .xls, .xlsx ou .pdf.",
    );
  }

  let fileStats;
  try {
    fileStats = await stat(params.filePath);
  } catch {
    throw new ImportFileError("FILE_NOT_FOUND", "O arquivo informado não foi encontrado.");
  }

  if (!fileStats.isFile()) {
    throw new ImportFileError("INVALID_FILE", "O caminho informado não é um arquivo.");
  }
  if (fileStats.size === 0) {
    throw new ImportFileError("EMPTY_FILE", "O arquivo está vazio.");
  }

  const maxSize = params.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  if (fileStats.size > maxSize) {
    throw new ImportFileError(
      "FILE_TOO_LARGE",
      `O arquivo excede o limite permitido de ${maxSize} bytes.`,
    );
  }

  const buffer = await readFile(params.filePath);
  const detectedFormat = detectFileType(buffer);
  if (detectedFormat === "unknown") {
    throw new ImportFileError(
      "INVALID_MIME_TYPE",
      "O conteúdo do arquivo não corresponde a XLS, XLSX ou PDF suportado.",
    );
  }
  if (extension !== `.${detectedFormat}`) {
    throw new ImportFileError(
      "INVALID_MIME_TYPE",
      "A extensão do arquivo não corresponde ao formato detectado.",
    );
  }

  return {
    buffer,
    detectedFormat,
    sanitizedFileName: displayName,
    sizeBytes: fileStats.size,
  };
}
