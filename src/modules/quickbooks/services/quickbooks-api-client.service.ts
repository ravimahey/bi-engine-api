import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { map, timeout } from 'rxjs/operators';
import { getAppConfig } from '@common/utils';
import { QuickbooksEnvironment } from '@config';
import {
  QUICKBOOKS_MAX_RETRY_ATTEMPTS,
  QUICKBOOKS_PRODUCTION_BASE_URL,
  QUICKBOOKS_REQUEST_TIMEOUT_MS,
  QUICKBOOKS_RETRY_BASE_DELAY_MS,
  QUICKBOOKS_RETRY_MAX_DELAY_MS,
  QUICKBOOKS_SANDBOX_BASE_URL,
} from '../constants';
import type { QuickbooksFault } from '../types';
import { QuickbooksAuthService } from './quickbooks-auth.service';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Low-level HTTP client for the QuickBooks Accounting API: resolves the
 * environment base URL, attaches the current session's bearer token, issues
 * the request through Nest's `HttpService` (axios wrapped in RxJS) with a
 * bounded timeout, and maps failures onto Nest's own `HttpException`
 * hierarchy instead of a one-size-fits-all 500. `QuickbooksService` and
 * `QuickbooksReportsService` both build on this rather than touching axios
 * or `QuickbooksAuthService` directly.
 */
@Injectable()
export class QuickbooksApiClientService {
  private readonly logger = new Logger(QuickbooksApiClientService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly quickbooksAuth: QuickbooksAuthService,
  ) {}

  /**
   * Issues one authenticated GET against `/v3/company/{realmId}{path}`.
   *
   * `organizationId`, when given, resolves the session off THAT
   * organization's own `ProviderConnection` (`getSessionForOrganization`) —
   * this is what the polling layer always passes, so one organization's
   * poll can never end up reading another organization's QuickBooks
   * company. Omitted (every pre-existing interactive `/quickbooks/*`
   * endpoint), it falls back to the original single-tenant `getSession()`
   * — unchanged behavior for callers that predate multi-tenant polling.
   */
  async get<T = unknown>(
    path: (realmId: string) => string,
    organizationId?: string,
  ): Promise<T> {
    const { realmId, accessToken } = organizationId
      ? await this.quickbooksAuth.getSessionForOrganization(organizationId)
      : await this.quickbooksAuth.getSession();
    const url = `${this.baseUrl()}/v3/company/${realmId}${path(realmId)}`;

    return this.requestWithRetry<T>(url, accessToken);
  }

  /**
   * Issues the GET, retrying transient failures (network error, our own
   * `timeout()` firing, 429/500/502/503) with backoff before ever calling
   * `handleError` — every existing caller (`QuickbooksService`,
   * `QuickbooksReportsService`, and the polling layer) gets this for free.
   * A 429 with a `Retry-After` header is honored over the usual backoff.
   */
  private async requestWithRetry<T>(
    url: string,
    accessToken: string,
    attempt = 1,
  ): Promise<T> {
    try {
      return await firstValueFrom(
        this.httpService
          .get<T>(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          })
          .pipe(
            // Belt-and-braces alongside HttpModule's axios-level timeout: this
            // also bounds the call if axios never surfaces its own timeout error.
            timeout(QUICKBOOKS_REQUEST_TIMEOUT_MS),
            map((response) => response.data),
          ),
      );
    } catch (error) {
      const retryDelayMs = this.retryDelayMs(error, attempt);
      if (retryDelayMs !== null) {
        this.logger.warn(
          `Transient QuickBooks failure on attempt ${attempt}/${QUICKBOOKS_MAX_RETRY_ATTEMPTS} — retrying in ${retryDelayMs}ms: ${url}`,
        );
        await sleep(retryDelayMs);
        return this.requestWithRetry<T>(url, accessToken, attempt + 1);
      }
      return this.handleError(error, url);
    }
  }

  /** `null` means "not retryable" (attempts exhausted, or a non-transient failure) — caller should fail now. */
  private retryDelayMs(error: unknown, attempt: number): number | null {
    if (attempt >= QUICKBOOKS_MAX_RETRY_ATTEMPTS) return null;

    if (!axios.isAxiosError(error)) {
      // Not an HTTP failure at all — e.g. our own `timeout()` operator. Treat as transient.
      return this.backoffMs(attempt);
    }

    if (!error.response) {
      // Never got a response — DNS failure, connection refused, axios's own timeout.
      return this.backoffMs(attempt);
    }

    const status = error.response.status;
    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
      const retryAfterSeconds = Number(error.response.headers?.['retry-after']);
      return Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
        ? retryAfterSeconds * 1000
        : this.backoffMs(attempt);
    }

    return status >= 500 ? this.backoffMs(attempt) : null;
  }

  private backoffMs(attempt: number): number {
    return Math.min(
      QUICKBOOKS_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
      QUICKBOOKS_RETRY_MAX_DELAY_MS,
    );
  }

  /**
   * Maps a failed QuickBooks call onto one of Nest's built-in HTTP
   * exceptions so the global exception filter renders a status/body that
   * reflects what actually went wrong, instead of a blanket 500.
   */
  private handleError(error: unknown, url: string): never {
    if (!axios.isAxiosError(error)) {
      // Not an HTTP failure at all — e.g. our own `timeout()` operator
      // firing a `TimeoutError`.
      this.logger.error(
        `QuickBooks request to ${url} failed unexpectedly: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new ServiceUnavailableException(
        'QuickBooks is unreachable — try again shortly',
      );
    }

    const axiosError = error as AxiosError<QuickbooksFault>;
    const status = axiosError.response?.status;
    const message =
      axiosError.response?.data?.Fault?.Error?.[0]?.Message ??
      axiosError.message;

    this.logger.error(
      `QuickBooks request to ${url} failed (status ${status ?? 'n/a'}): ${message}`,
    );

    if (!axiosError.response) {
      // Request never got a response — DNS failure, connection refused, or
      // axios's own timeout firing.
      throw new ServiceUnavailableException(
        'QuickBooks is unreachable — try again shortly',
      );
    }

    switch (status) {
      case HttpStatus.UNAUTHORIZED:
      case HttpStatus.FORBIDDEN:
        throw new UnauthorizedException(
          'QuickBooks session expired — reconnect at /quickbooks/connect',
        );
      case HttpStatus.NOT_FOUND:
        throw new NotFoundException(
          `QuickBooks resource not found: ${message}`,
        );
      case HttpStatus.TOO_MANY_REQUESTS:
        throw new HttpException(
          'QuickBooks rate limit exceeded — try again shortly',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      default:
        if (status !== undefined && status >= 500) {
          throw new ServiceUnavailableException(
            `QuickBooks is currently unavailable: ${message}`,
          );
        }
        throw new BadGatewayException(`QuickBooks request failed: ${message}`);
    }
  }

  private baseUrl(): string {
    const { quickbooks } = getAppConfig(this.configService);
    return quickbooks.environment === QuickbooksEnvironment.Production
      ? QUICKBOOKS_PRODUCTION_BASE_URL
      : QUICKBOOKS_SANDBOX_BASE_URL;
  }
}
