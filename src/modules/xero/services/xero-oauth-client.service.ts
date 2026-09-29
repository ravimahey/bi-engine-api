import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { firstValueFrom } from 'rxjs';
import { getAppConfig } from '@common/utils';
import {
  XERO_AUTHORIZE_URL,
  XERO_CONNECTIONS_URL,
  XERO_REVOCATION_URL,
  XERO_SCOPES,
  XERO_TOKEN_URL,
} from '../constants';
import type {
  XeroErrorBody,
  XeroTenantConnection,
  XeroTokenResponse,
} from '../types';

/**
 * Thin HTTP client for Xero's identity endpoints — authorize URL, token
 * exchange/refresh/revocation, and `GET /connections` tenant listing. There
 * is no official Xero SDK dependency here on purpose: the OAuth flow is four
 * plain HTTP calls. `XeroAuthService` owns *when* these run and what gets
 * persisted; this class only knows how to make the calls.
 */
@Injectable()
export class XeroOAuthClientService {
  private readonly logger = new Logger(XeroOAuthClientService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  buildAuthorizeUrl(state: string): string {
    const { xero } = getAppConfig(this.configService);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: xero.clientId,
      redirect_uri: xero.redirectUri,
      scope: XERO_SCOPES.join(' '),
      state,
    });
    return `${XERO_AUTHORIZE_URL}?${params.toString()}`;
  }

  exchangeCode(code: string): Promise<XeroTokenResponse> {
    const { xero } = getAppConfig(this.configService);
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: xero.redirectUri,
    });
  }

  /** Xero rotates the refresh token on every use — the caller must persist the returned one immediately. */
  refresh(refreshToken: string): Promise<XeroTokenResponse> {
    return this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  /** Revokes the refresh token (and every access token minted from it). Best effort — a failure is logged, not thrown. */
  async revoke(refreshToken: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          XERO_REVOCATION_URL,
          new URLSearchParams({ token: refreshToken }).toString(),
          { headers: this.basicAuthHeaders() },
        ),
      );
    } catch (error) {
      this.logger.warn(`Xero token revocation failed: ${this.describe(error)}`);
    }
  }

  /** Step 0 — the tenants (organisations) this access token may call, each needing its own `Xero-tenant-id` header. */
  async listTenants(accessToken: string): Promise<XeroTenantConnection[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<XeroTenantConnection[]>(XERO_CONNECTIONS_URL, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }),
      );
      return response.data ?? [];
    } catch (error) {
      throw this.toException('listing Xero tenants', error);
    }
  }

  private async tokenRequest(
    body: Record<string, string>,
  ): Promise<XeroTokenResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<XeroTokenResponse>(
          XERO_TOKEN_URL,
          new URLSearchParams(body).toString(),
          { headers: this.basicAuthHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      throw this.toException(`Xero ${body.grant_type} grant`, error);
    }
  }

  private basicAuthHeaders(): Record<string, string> {
    const { xero } = getAppConfig(this.configService);
    const credentials = Buffer.from(
      `${xero.clientId}:${xero.clientSecret}`,
    ).toString('base64');
    return {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
  }

  /** A 4xx from identity means bad/expired credentials (reconnect); anything else means Xero is unreachable. */
  private toException(action: string, error: unknown): Error {
    const message = this.describe(error);
    this.logger.error(`${action} failed: ${message}`);

    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    return status !== undefined && status >= 400 && status < 500
      ? new UnauthorizedException(
          `Xero rejected the request (${message}) — reconnect at /xero/connect`,
        )
      : new ServiceUnavailableException(
          'Xero is unreachable — try again shortly',
        );
  }

  private describe(error: unknown): string {
    if (!axios.isAxiosError<XeroErrorBody>(error)) {
      return (error as Error).message;
    }
    const data = error.response?.data;
    return (
      data?.error_description ?? data?.error ?? data?.Detail ?? error.message
    );
  }
}
