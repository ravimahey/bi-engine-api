import type { ConnectionStatus } from '@modules/providers/entities';
import type { QuickbooksPollStepEntity } from './quickbooks-poll.interface';

/** One entity's sync freshness — `cursor`/`lastSyncedAt` are both null when this entity has never been synced for this connection. */
export interface QuickbooksSyncStatusEntity {
  entity: QuickbooksPollStepEntity;
  lastSyncedAt: Date | null;
  cursor: string | null;
}

/** Result of `GET /quickbooks/sync-status` — one row per entity `QuickbooksPollingService` can sync, even ones never synced yet. */
export interface QuickbooksSyncStatusResult {
  organizationId: string;
  /** `null` when this organization has never connected QuickBooks at all. */
  providerConnectionId: string | null;
  connectionStatus: ConnectionStatus | null;
  entities: QuickbooksSyncStatusEntity[];
}
