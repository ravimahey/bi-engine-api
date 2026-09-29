import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '@common/decorators';
import {
  assertOwnOrganization,
  buildOAuthState,
  getAppConfig,
  parseOAuthState,
} from '@common/utils';
import type { ProviderConnection } from '@modules/providers/entities';
import { ConnectionStatus, ProviderType } from '@modules/providers/entities';
import {
  ProviderConnectionsService,
  SyncCursorsService,
} from '@modules/providers/services';
import { UserRole } from '@modules/users/entities';
import {
  XERO_CONNECTED_PATH,
  XERO_ERROR_PATH,
  XERO_REFRESH_SKEW_MS,
  XERO_REFRESH_TOKEN_TTL_MS,
} from '../constants';
import type { XeroCallbackQueryDto } from '../dto';
import type {
  XeroConnectionStatus,
  XeroSession,
  XeroTokenResponse,
} from '../types';
import { pickConnectedTenant, readAuthEventId } from '../utils';
import { XeroOAuthClientService } from './xero-oauth-client.service';

/**
 * Owns the Xero OAuth 2.0 connection lifecycle (Step 0): starting consent,
 * exchanging the callback code, resolving which tenant was authorized,
 * persisting everything on the shared `provider_connections` row
 * (`externalRealmId` = Xero tenant id), and keeping the 30-minute access
 * token fresh. Unlike QuickBooks there's no legacy single-tenant table —
 * every session is organization-scoped from the start.
 */
@Injectable()
export class XeroAuthService {
  private readonly logger = new Logger(XeroAuthService.name);

  // Single-flight refresh per connection. Xero rotates the refresh token on
  // every use, so two concurrent refreshes (a poll and a webhook pull, say)
  // would race — the second could present an already-rotated token.
  private readonly refreshesInFlight = new Map<
    string,
    Promise<ProviderConnection>
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly oauthClient: XeroOAuthClientService,
    private readonly providerConnections: ProviderConnectionsService,
    private readonly syncCursors: SyncCursorsService,
  ) {}

  /** Builds the Xero consent URL, carrying `organizationId` inside the signed `state`. Non-admins may only connect their own organization. */
  getAuthUri(organizationId: string, currentUser: AuthenticatedUser): string {
    this.assertAccess(organizationId, currentUser);
    return this.oauthClient.buildAuthorizeUrl(
      buildOAuthState(this.stateSecret(), organizationId),
    );
  }

  /** Full callback flow — returns where to send the browser next, success or error, logging failures rather than swallowing them. */
  async handleCallback(dto: XeroCallbackQueryDto): Promise<string> {
    const { frontendUrl } = getAppConfig(this.configService).auth;

    try {
      await this.connect(dto);
      return `${frontendUrl}${XERO_CONNECTED_PATH}?xero=connected`;
    } catch (error) {
      this.logger.error(
        `Xero OAuth callback failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return `${frontendUrl}${XERO_ERROR_PATH}?xero=error`;
    }
  }

  /** `organizationId`'s own Xero connection, refreshed first if its access token is at or near expiry. */
  async ensureProviderConnection(
    organizationId: string,
  ): Promise<ProviderConnection> {
    const connection = await this.providerConnections.findWithTokensOrNull(
      organizationId,
      ProviderType.XERO,
    );

    if (!connection || connection.status === ConnectionStatus.DISCONNECTED) {
      throw new UnauthorizedException(
        `Xero is not connected for organization "${organizationId}" — visit /xero/connect`,
      );
    }

    return this.refreshIfNeeded(connection);
  }

  /** The tenant id + a fresh access token for `organizationId` — what every Accounting API call needs. */
  async getSessionForOrganization(
    organizationId: string,
  ): Promise<XeroSession> {
    const connection = await this.ensureProviderConnection(organizationId);

    if (!connection.accessToken) {
      throw new UnauthorizedException(
        `Xero is not connected for organization "${organizationId}" — visit /xero/connect`,
      );
    }

    return {
      tenantId: connection.externalRealmId,
      accessToken: connection.accessToken,
    };
  }

  /** Read-only connection state for the frontend's Connect/Sync button. Never refreshes tokens. */
  async getConnectionStatus(
    organizationId: string,
    currentUser: AuthenticatedUser,
  ): Promise<XeroConnectionStatus> {
    this.assertAccess(organizationId, currentUser);

    const connection = await this.providerConnections.findOrNull(
      organizationId,
      ProviderType.XERO,
    );

    return {
      provider: ProviderType.XERO,
      connected: connection?.status === ConnectionStatus.CONNECTED,
      status: connection?.status ?? null,
      externalRealmId: connection?.externalRealmId ?? null,
      connectedAt: connection?.connectedAt ?? null,
      lastError: connection?.lastError ?? null,
    };
  }

  /**
   * Revokes the tokens at Xero (best effort), then clears them locally and
   * marks the connection `disconnected` — the row itself stays so already
   * synced records keep a valid `sourceConnection`.
   */
  async disconnect(
    organizationId: string,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    this.assertAccess(organizationId, currentUser);

    const connection = await this.providerConnections.findWithTokensOrNull(
      organizationId,
      ProviderType.XERO,
    );
    if (!connection) {
      throw new NotFoundException(
        `Xero is not connected for organization "${organizationId}"`,
      );
    }

    if (connection.refreshToken) {
      await this.oauthClient.revoke(connection.refreshToken);
    }
    await this.providerConnections.markDisconnected(connection.id);
  }

  private async connect(dto: XeroCallbackQueryDto): Promise<void> {
    const claims = parseOAuthState(dto.state, this.stateSecret());
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired Xero OAuth state');
    }
    if (dto.error || !dto.code) {
      throw new UnauthorizedException(
        `Xero consent was not granted: ${dto.error ?? 'no code returned'}`,
      );
    }

    const token = await this.oauthClient.exchangeCode(dto.code);

    // Step 0 — the access token alone doesn't say which organisation it's
    // for; every Accounting call needs the tenant id from /connections.
    const tenants = await this.oauthClient.listTenants(token.access_token);
    const tenant = pickConnectedTenant(
      tenants,
      readAuthEventId(token.access_token),
    );
    if (!tenant) {
      throw new UnauthorizedException(
        'No Xero organisation was authorized in this consent',
      );
    }

    const previous = await this.providerConnections.findOrNull(
      claims.organizationId,
      ProviderType.XERO,
    );
    const saved = await this.persistToken(
      claims.organizationId,
      tenant.tenantId,
      token,
    );

    // Reconnecting to a *different* Xero organisation reuses the same
    // connection row. Its old If-Modified-Since cursors describe the previous
    // tenant, and keeping them would make the new tenant's first sync
    // incremental, fetching only the last few minutes of changes.
    if (previous && previous.externalRealmId !== tenant.tenantId) {
      await this.syncCursors.deleteAllForConnection(saved.id);
      this.logger.warn(
        `Organization ${claims.organizationId} switched Xero tenant ${previous.externalRealmId} → ${tenant.tenantId}; sync cursors reset so the next sync is a full pull`,
      );
    }

    this.logger.log(
      `Connected Xero tenant ${tenant.tenantId} (${tenant.tenantName ?? 'unnamed'}) to organization ${claims.organizationId}`,
    );
  }

  private refreshIfNeeded(
    connection: ProviderConnection,
  ): Promise<ProviderConnection> {
    if (
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() >
        Date.now() + XERO_REFRESH_SKEW_MS
    ) {
      return Promise.resolve(connection);
    }

    const inFlight = this.refreshesInFlight.get(connection.id);
    if (inFlight) return inFlight;

    const refresh = this.refresh(connection).finally(() =>
      this.refreshesInFlight.delete(connection.id),
    );
    this.refreshesInFlight.set(connection.id, refresh);
    return refresh;
  }

  private async refresh(
    connection: ProviderConnection,
  ): Promise<ProviderConnection> {
    if (!connection.refreshToken) {
      throw new UnauthorizedException(
        `Xero session expired for organization "${connection.organizationId}" — reconnect at /xero/connect`,
      );
    }

    try {
      const token = await this.oauthClient.refresh(connection.refreshToken);
      // Persist right away: the old refresh token is now spent.
      return await this.persistToken(
        connection.organizationId,
        connection.externalRealmId,
        token,
      );
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Xero token refresh failed for organization "${connection.organizationId}": ${message}`,
      );
      // Only a rejection from Xero (expired/revoked refresh token) means the
      // connection is broken; a network blip just fails this one call.
      if (!(error instanceof UnauthorizedException)) throw error;

      await this.providerConnections.markError(connection.id, message);
      throw new UnauthorizedException(
        'Xero session expired — reconnect at /xero/connect',
      );
    }
  }

  private persistToken(
    organizationId: string,
    tenantId: string,
    token: XeroTokenResponse,
  ): Promise<ProviderConnection> {
    const now = Date.now();
    return this.providerConnections.upsertTokens({
      organizationId,
      provider: ProviderType.XERO,
      externalRealmId: tenantId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt: new Date(now + token.expires_in * 1000),
      refreshTokenExpiresAt: new Date(now + XERO_REFRESH_TOKEN_TTL_MS),
    });
  }

  private assertAccess(
    organizationId: string,
    currentUser: AuthenticatedUser,
  ): void {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(currentUser.organizationId, organizationId);
    }
  }

  /** Signing key for the OAuth CSRF state — a secret already scoped to this integration. */
  private stateSecret(): string {
    return getAppConfig(this.configService).xero.clientSecret;
  }
}
