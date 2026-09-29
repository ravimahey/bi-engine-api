import type { ConnectionStatus } from '@modules/providers/entities';
import type { XeroPollStepEntity } from './xero-poll.interface';

/** One entity's sync freshness — both fields null when never synced for this connection. */
export interface XeroSyncStatusEntity {
  entity: XeroPollStepEntity;
  lastSyncedAt: Date | null;
  cursor: string | null;
}

/** Result of `GET /xero/sync-status` — one row per entity `XeroPollingService` can sync. */
export interface XeroSyncStatusResult {
  organizationId: string;
  providerConnectionId: string | null;
  connectionStatus: ConnectionStatus | null;
  entities: XeroSyncStatusEntity[];
}
