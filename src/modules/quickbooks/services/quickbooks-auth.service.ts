import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import OAuthClient from 'intuit-oauth';
import { Repository } from 'typeorm';
import { getAppConfig } from '@common/utils';
import { QuickbooksCallbackQueryDto } from '../dto';
import { QuickbooksConnection } from '../entities';
import type { QuickbooksSession, QuickbooksTokenResponse } from '../types';
import { QUICKBOOKS_CONNECTED_PATH, QUICKBOOKS_ERROR_PATH } from '../constants';
import { buildQuickbooksState, isValidQuickbooksState } from '../utils';

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
  ) {
    const { quickbooks } = this.appConfig();
    this.oauthClient = new OAuthClient({
      clientId: quickbooks.clientId,
      clientSecret: quickbooks.clientSecret,
      environment: quickbooks.environment,
      redirectUri: quickbooks.redirectUri,
    });
  }

  /** Builds the Intuit consent-screen URL, with a signed CSRF state to verify on callback. */
  getAuthUri(): string {
    return this.oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state: buildQuickbooksState(this.stateSecret()),
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
      return {
        realmId: connection.realmId,
        accessToken: connection.accessToken,
      };
    }

    return this.refresh(connection);
  }

  /** Exchanges the callback URL for tokens and persists them, keyed by realm. */
  private async exchangeToken(
    callbackUrl: string,
    state: unknown,
    realmId: string,
  ): Promise<QuickbooksConnection> {
    if (!isValidQuickbooksState(state, this.stateSecret())) {
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
    return this.connections.save(connection);
  }

  private async refresh(
    connection: QuickbooksConnection,
  ): Promise<QuickbooksSession> {
    try {
      const refreshResponse = await this.oauthClient.refreshUsingToken(
        connection.refreshToken,
      );
      const token = refreshResponse.getJson() as QuickbooksTokenResponse;

      this.applyToken(connection, token);
      await this.connections.save(connection);

      return {
        realmId: connection.realmId,
        accessToken: connection.accessToken,
      };
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
