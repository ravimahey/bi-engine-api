import type { ProviderType } from '../entities';

/** Input for `ProviderConnectionsService.upsertTokens` — one full token refresh. */
export interface UpsertProviderConnectionTokens {
  organizationId: string;
  provider: ProviderType;
  externalRealmId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}
