import type { QuickbooksPollEntity } from '../constants';

/**
 * `QuickbooksPollEntity` plus the always-run, non-filterable `CompanyInfo`
 * step — see `QuickbooksPollingService.pollCompanyInfo`.
 */
export type QuickbooksPollStepEntity = QuickbooksPollEntity | 'CompanyInfo';

/** Outcome of polling one entity for one connection — one entry per `QuickbooksPollStepEntity` processed. */
export interface QuickbooksEntityPollResult {
  entity: QuickbooksPollStepEntity;
  /**
   * `completed` — every remaining chunk (or the full master-data refetch)
   * synced. `skipped` — the requested range was already covered by the
   * cursor, nothing to do. `partial` — at least one chunk synced before a
   * later chunk failed; the cursor sits at the end of the last success.
   * `failed` — the first chunk attempted failed; the cursor is unchanged.
   */
  status: 'completed' | 'skipped' | 'partial' | 'failed';
  chunksCompleted: number;
  recordsSynced: number;
  /** The `SyncCursor` value after this run — `null` only if this entity has never synced and this run also failed. */
  cursor: string | null;
  error?: string;
}

/** Result of one `POST /quickbooks/poll` call — one entry per entity actually processed. */
export interface QuickbooksPollResult {
  organizationId: string;
  providerConnectionId: string;
  entities: QuickbooksEntityPollResult[];
}
