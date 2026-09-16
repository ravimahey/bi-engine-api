import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import OAuthClient from 'intuit-oauth';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization, getAppConfig } from '@common/utils';
import type { ProviderConnection } from '@modules/providers/entities';
import { ProviderType } from '@modules/providers/entities';
import { ProviderConnectionsService } from '@modules/providers/services';
import { UserRole } from '@modules/users/entities';
import { QuickbooksCallbackQueryDto } from '../dto';
import { QuickbooksConnection } from '../entities';
import type { QuickbooksSession, QuickbooksTokenResponse } from '../types';
import { QUICKBOOKS_CONNECTED_PATH, QUICKBOOKS_ERROR_PATH } from '../constants';
import { buildQuickbooksState, parseQuickbooksState } from '../utils';

// Refresh a little ahead of the real expiry so a request never races it.
const REFRESH_SKEW_MS = 60_000;

const TOKEN_COLUMNS = {
  id: true,
  realmId: true,
  accessToken: true,
  refreshToken: true,
  accessTokenExpiresAt: true,
  refreshTokenExpiresAt: true,
} as const;

/**
 * Owns the QuickBooks OAuth2 lifecycle: starting the consent flow,
 * exchanging the callback for tokens, persisting them, and keeping the
 * access token fresh. `QuickbooksService` (the API-calling side) asks this
 * for a session and never touches tokens or the `intuit-oauth` client
 * directly — same split as `PasswordService`/`UsersService`.
 */
@Injectable()
export class QuickbooksAuthService {
  private readonly logger = new Logger(QuickbooksAuthService.name);
  private readonly oauthClient: OAuthClient;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(QuickbooksConnection)
    private readonly connections: Repository<QuickbooksConnection>,
    private readonly providerConnections: ProviderConnectionsService,
  ) {
    const { quickbooks } = this.appConfig();
    this.oauthClient = new OAuthClient({
      clientId: quickbooks.clientId,
      clientSecret: quickbooks.clientSecret,
      environment: quickbooks.environment,
      redirectUri: quickbooks.redirectUri,
    });
  }

  /**
   * Builds the Intuit consent-screen URL. `organizationId` — the
   * organization starting this connect flow — is embedded in the signed
   * `state` value, not just a CSRF nonce: it's how the callback leg later
   * knows which organization's `ProviderConnection` to associate the
   * returned realm/tokens with, without trusting an unsigned value from the
   * redirect itself. A non-admin caller can only start this flow for their
   * own organization.
   */
  getAuthUri(organizationId: string, currentUser: AuthenticatedUser): string {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      console.log(
        'assertOwnOrganization',
        currentUser.organizationId,
        organizationId,
      );
      assertOwnOrganization(currentUser.organizationId, organizationId);
    }

    return this.oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state: buildQuickbooksState(this.stateSecret(), organizationId),
    });
  }

  /**
   * Full OAuth callback flow: exchanges the code for tokens, persists them,
   * and returns where to send the browser next — success or error, either
   * way logged here rather than swallowed.
   */
  async handleCallback(
    rawQuery: Record<string, string>,
    dto: QuickbooksCallbackQueryDto,
  ): Promise<string> {
    const config = this.appConfig();
    const callbackUrl = `${config.quickbooks.redirectUri}?${new URLSearchParams(
      rawQuery,
    ).toString()}`;

    try {
      await this.exchangeToken(callbackUrl, dto.state, dto.realmId);
      return `${config.auth.frontendUrl}${QUICKBOOKS_CONNECTED_PATH}`;
    } catch (error) {
      this.logger.error(
        `QuickBooks OAuth callback failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return `${config.auth.frontendUrl}${QUICKBOOKS_ERROR_PATH}`;
    }
  }

  /**
   * Returns a usable {realmId, accessToken} pair, refreshing first if the
   * access token is at or past expiry. Single-tenant: this is the most
   * recently connected company.
   */
  async getSession(): Promise<QuickbooksSession> {
    const connection = await this.currentConnection();
    return { realmId: connection.realmId, accessToken: connection.accessToken };
  }

  /**
   * Resolves `organizationId`'s own `ProviderConnection` — the polling/sync
   * layer's (raw entities, SyncCursor) source of truth for which QuickBooks
   * company and tokens belong to this organization.
   *
   * The connect flow (`getAuthUri` → `/quickbooks/callback` →
   * `exchangeToken`) associates a `ProviderConnection` with its organization
   * at connect time, using the organization id carried securely through the
   * signed OAuth `state` — never guessed here. So this method does NOT fall
   * back to the legacy single-tenant `QuickbooksConnection` table's "most
   * recently connected" row: doing so previously let one organization's
   * first poll accidentally bind to a different organization's company.
   * If no `ProviderConnection` exists yet, that organization genuinely
   * hasn't completed `/quickbooks/connect` and must be told so, not handed
   * someone else's connection.
   */
  async ensureProviderConnection(
    organizationId: string,
  ): Promise<ProviderConnection> {
    const existing = await this.providerConnections.findWithTokensOrNull(
      organizationId,
      ProviderType.QUICKBOOKS,
    );

    if (!existing) {
      throw new UnauthorizedException(
        `QuickBooks is not connected for organization "${organizationId}" — visit /quickbooks/connect`,
      );
    }

    return this.refreshProviderConnection(existing);
  }

  /**
   * Organization-scoped equivalent of `getSession()` — resolves the realm
   * and access token off `organizationId`'s own `ProviderConnection`
   * (bridging/refreshing it first via `ensureProviderConnection`) instead of
   * the single global "most recently connected" legacy connection. This is
   * what the polling layer uses for every actual QuickBooks API call, so an
   * organization's poll can never read another organization's company data.
   */
  async getSessionForOrganization(
    organizationId: string,
  ): Promise<QuickbooksSession> {
    const connection = await this.ensureProviderConnection(organizationId);

    if (!connection.accessToken) {
      throw new UnauthorizedException(
        `QuickBooks is not connected for organization "${organizationId}" — visit /quickbooks/connect`,
      );
    }

    return {
      realmId: connection.externalRealmId,
      accessToken: connection.accessToken,
    };
  }

  /**
   * Refreshes one organization's `ProviderConnection` in place if its access
   * token is at or past expiry, using the SAME `intuit-oauth` client this
   * service already uses for the legacy flow — no second OAuth
   * implementation. The refreshed tokens are written back only to this
   * connection's own `(organizationId, provider)` row.
   */
  private async refreshProviderConnection(
    connection: ProviderConnection,
  ): Promise<ProviderConnection> {
    if (
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() > Date.now() + REFRESH_SKEW_MS
    ) {
      return connection;
    }

    if (!connection.refreshToken) {
      throw new UnauthorizedException(
        `QuickBooks session expired for organization "${connection.organizationId}" — reconnect at /quickbooks/connect`,
      );
    }

    try {
      const refreshResponse = await this.oauthClient.refreshUsingToken(
        connection.refreshToken,
      );
      const token = refreshResponse.getJson() as QuickbooksTokenResponse;
      const now = Date.now();

      return await this.providerConnections.upsertTokens({
        organizationId: connection.organizationId,
        provider: connection.provider,
        externalRealmId: connection.externalRealmId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessTokenExpiresAt: new Date(now + token.expires_in * 1000),
        refreshTokenExpiresAt: new Date(
          now + token.x_refresh_token_expires_in * 1000,
        ),
      });
    } catch (error) {
      this.logger.error(
        `QuickBooks token refresh failed for organization "${connection.organizationId}": ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new UnauthorizedException(
        'QuickBooks session expired — reconnect at /quickbooks/connect',
      );
    }
  }

  /** The current connection's row, refreshed first if its access token is at or past expiry. */
  private async currentConnection(): Promise<QuickbooksConnection> {
    const [connection] = await this.connections.find({
      order: { updatedAt: 'DESC' },
      take: 1,
      select: TOKEN_COLUMNS,
    });

    if (!connection) {
      throw new UnauthorizedException(
        'QuickBooks is not connected yet — visit /quickbooks/connect',
      );
    }

    if (
      connection.accessTokenExpiresAt.getTime() >
      Date.now() + REFRESH_SKEW_MS
    ) {
      return connection;
    }

    return this.refresh(connection);
  }

  /**
   * Exchanges the callback URL for tokens, persists them into the legacy
   * `quickbooks_connections` row keyed by realm (unchanged — still what
   * `getSession()`/the interactive `/quickbooks/*` endpoints read), and
   * immediately associates the same realm/tokens with the organization that
   * started this flow (recovered from the signed `state`) by upserting its
   * `ProviderConnection`. This is the fix: an organization is bound to its
   * QuickBooks company right here, at connect time, from a value Intuit's
   * own round trip can't have tampered with — not inferred later from
   * whichever legacy connection happens to be most recently updated.
   */
  private async exchangeToken(
    callbackUrl: string,
    state: unknown,
    realmId: string,
  ): Promise<QuickbooksConnection> {
    const stateClaims = parseQuickbooksState(state, this.stateSecret());
    if (!stateClaims) {
      throw new UnauthorizedException(
        'Invalid or expired QuickBooks OAuth state',
      );
    }
    if (!realmId) {
      throw new UnauthorizedException(
        'QuickBooks callback is missing a realmId',
      );
    }

    const authResponse = await this.oauthClient.createToken(callbackUrl);
    const token = authResponse.getJson() as QuickbooksTokenResponse;

    const connection =
      (await this.connections.findOneBy({ realmId })) ??
      this.connections.create({ realmId });

    this.applyToken(connection, token);
    const saved = await this.connections.save(connection);

    await this.providerConnections.upsertTokens({
      organizationId: stateClaims.organizationId,
      provider: ProviderType.QUICKBOOKS,
      externalRealmId: saved.realmId,
      accessToken: saved.accessToken,
      refreshToken: saved.refreshToken,
      accessTokenExpiresAt: saved.accessTokenExpiresAt,
      refreshTokenExpiresAt: saved.refreshTokenExpiresAt,
    });

    return saved;
  }

  private async refresh(
    connection: QuickbooksConnection,
  ): Promise<QuickbooksConnection> {
    try {
      const refreshResponse = await this.oauthClient.refreshUsingToken(
        connection.refreshToken,
      );
      const token = refreshResponse.getJson() as QuickbooksTokenResponse;

      this.applyToken(connection, token);
      return await this.connections.save(connection);
    } catch (error) {
      this.logger.error(
        `QuickBooks token refresh failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new UnauthorizedException(
        'QuickBooks session expired — reconnect at /quickbooks/connect',
      );
    }
  }

  /** Copies a fresh token response onto the entity. Refresh tokens rotate — always overwrite. */
  private applyToken(
    connection: QuickbooksConnection,
    token: QuickbooksTokenResponse,
  ): void {
    const now = Date.now();
    connection.accessToken = token.access_token;
    connection.refreshToken = token.refresh_token;
    connection.accessTokenExpiresAt = new Date(now + token.expires_in * 1000);
    connection.refreshTokenExpiresAt = new Date(
      now + token.x_refresh_token_expires_in * 1000,
    );
  }

  /** Signing key for the OAuth CSRF state — a secret already scoped to this integration. */
  private stateSecret(): string {
    return this.appConfig().quickbooks.clientSecret;
  }

  private appConfig() {
    return getAppConfig(this.configService);
  }
}
