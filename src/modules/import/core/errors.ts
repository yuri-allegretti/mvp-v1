import type { ImportIssue } from "./types";

export class ImportFileError extends Error {
  readonly code: string;
  readonly rowNumber?: number;
  readonly rawValue?: unknown;

  constructor(
    code: string,
    message: string,
    options: { rowNumber?: number; rawValue?: unknown } = {},
  ) {
    super(message);
    this.name = "ImportFileError";
    this.code = code;
    if (options.rowNumber !== undefined) this.rowNumber = options.rowNumber;
    if (options.rawValue !== undefined) this.rawValue = options.rawValue;
  }

  toIssue(): ImportIssue {
    return {
      code: this.code,
      severity: "error",
      message: this.message,
      ...(this.rowNumber !== undefined ? { rowNumber: this.rowNumber } : {}),
      ...(this.rawValue !== undefined ? { rawValue: this.rawValue } : {}),
    };
  }
}
