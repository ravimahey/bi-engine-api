import type {
  ConnectionStatus,
  ProviderType,
} from '@modules/providers/entities';

/**
 * Response shape for `GET /quickbooks/connection-status` — whether an
 * organization has ever connected QuickBooks, and if so, its current state.
 * `connected` is the one field most callers need; `status`/`externalRealmId`/
 * `connectedAt`/`lastError` are `null` together when no `ProviderConnection`
 * row exists yet for this organization at all (never connected, as opposed
 * to connected-then-disconnected, which still has a row).
 */
export interface QuickbooksConnectionStatus {
  provider: ProviderType;
  connected: boolean;
  status: ConnectionStatus | null;
  externalRealmId: string | null;
  connectedAt: Date | null;
  lastError: string | null;
}
