import type { DetectedFormat, ImportIssue } from "../types";

export type ParsedLineDisposition =
  | "candidate"
  | "ignored"
  | "future"
  | "invalid";

export interface ParsedStatementLine {
  sourceRowNumber: number;
  pageNumber?: number;
  rawDate: unknown;
  rawDescription: unknown;
  rawAmount: unknown;
  rawBalance?: unknown;
  disposition: ParsedLineDisposition;
  reasonCode?: string;
  rawData: Record<string, unknown>;
}

export interface ParsedStatementMetadata {
  periodStart?: string;
  periodEnd?: string;
  agency?: string;
  accountNumber?: string;
  holderName?: string;
}

export interface ParsedStatement {
  detectedBank: "itau";
  detectedFormat: Exclude<DetectedFormat, "unknown">;
  detectedLayout: "itau-layout-v1";
  metadata: ParsedStatementMetadata;
  lines: ParsedStatementLine[];
  issues: ImportIssue[];
}
