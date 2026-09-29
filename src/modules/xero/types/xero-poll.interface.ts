import type { XeroPollEntity } from '../constants';

/** `XeroPollEntity` plus the always-run `Organisation` step. */
export type XeroPollStepEntity = XeroPollEntity | 'Organisation';

/** Outcome of polling one entity for one connection. */
export interface XeroEntityPollResult {
  entity: XeroPollStepEntity;
  /**
   * `full` — pulled everything (first sync, `fullSync`, or an endpoint that
   * doesn't support If-Modified-Since). `incremental` — only records changed
   * since the stored cursor. `failed` — the cursor is unchanged.
   */
  status: 'full' | 'incremental' | 'failed';
  recordsFetched: number;
  /** The `SyncCursor` after this run — `null` only if this entity has never synced and this run also failed. */
  cursor: string | null;
  error?: string;
}

/** Result of one `POST /xero/poll` call. */
export interface XeroPollResult {
  organizationId: string;
  providerConnectionId: string;
  tenantId: string;
  entities: XeroEntityPollResult[];
}

/** Options for one poll run — the same code path serves `POST /xero/poll` and webhook-triggered pulls. */
export interface XeroPollOptions {
  entities?: readonly XeroPollEntity[];
  /** Ignore stored cursors and pull everything — the periodic reconciliation pass. */
  fullSync?: boolean;
  /** Lower bound (YYYY-MM-DD) on transaction `Date` for a full pull. */
  fromDate?: string;
}
