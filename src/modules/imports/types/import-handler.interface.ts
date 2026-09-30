import type { EntityManager } from 'typeorm';
import type { ImportIssue } from './import-issue.interface';
import type { ImportSummary } from './import-summary.interface';
import type { ReadRow } from './parsed-sheet.interface';

/** Per-import facts every handler needs. */
export interface ImportContext {
  organizationId: string;
  /** Used when a row has no Currency column value. */
  defaultCurrency: string;
}

export interface ImportValidation<TRecord> {
  records: TRecord[];
  issues: ImportIssue[];
  summary: ImportSummary;
  /** First few records flattened for display — column header → value. */
  preview: Array<Record<string, string>>;
}

/**
 * One import type's business rules: turn parsed rows into normalized
 * records (checking cross-row and database consistency), and later write
 * those records inside the commit transaction. `commit` must re-check any
 * database references, since data can change between validate and commit.
 */
export interface ImportHandler<TRecord = unknown> {
  validate(
    rows: ReadRow[],
    context: ImportContext,
  ): Promise<ImportValidation<TRecord>>;
  commit(
    records: TRecord[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<void>;
}
