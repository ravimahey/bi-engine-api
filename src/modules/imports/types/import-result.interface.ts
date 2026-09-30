import type { ImportStatus, ImportType } from '../entities';
import type { ImportIssue } from './import-issue.interface';
import type { ImportSummary } from './import-summary.interface';

/** Response of `POST /imports/validate` — what the preview screen renders. */
export interface ImportValidationResult {
  id: string;
  importType: ImportType;
  status: ImportStatus;
  fileName: string;
  totalRows: number;
  errorCount: number;
  warningCount: number;
  /** Capped at `MAX_RETURNED_ISSUES`; the counts above are the true totals. */
  issues: ImportIssue[];
  summary: ImportSummary | null;
  preview: Array<Record<string, string>>;
  /** When a validated import can no longer be committed. */
  expiresAt: string | null;
  createdAt: string;
  committedAt: string | null;
}

/** One row of `GET /imports` — the history list, without issues or preview. */
export interface ImportHistoryItem {
  id: string;
  importType: ImportType;
  status: ImportStatus;
  fileName: string;
  totalRows: number;
  errorCount: number;
  warningCount: number;
  summary: ImportSummary | null;
  createdAt: Date;
  committedAt: Date | null;
}
