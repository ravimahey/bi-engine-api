import type {
  ConnectionStatus,
  ProviderType,
} from '@modules/providers/entities';

/**
 * Response shape for `GET /xero/connection-status` — mirrors
 * `QuickbooksConnectionStatus` so the frontend can treat both providers the
 * same. `externalRealmId` is the Xero tenant id. Everything but `provider`/
 * `connected` is `null` when this organization has never connected Xero.
 */
export interface XeroConnectionStatus {
  provider: ProviderType;
  connected: boolean;
  status: ConnectionStatus | null;
  externalRealmId: string | null;
  connectedAt: Date | null;
  lastError: string | null;
}
