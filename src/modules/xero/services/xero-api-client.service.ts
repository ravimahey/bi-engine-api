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
import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import {
  XERO_ACCOUNTING_BASE_URL,
  XERO_DAY_LIMIT_THRESHOLD,
  XERO_MAX_RETRY_ATTEMPTS,
  XERO_MIN_LIMIT_PAUSE_MS,
  XERO_MIN_LIMIT_THRESHOLD,
  XERO_REQUEST_TIMEOUT_MS,
  XERO_RETRY_BASE_DELAY_MS,
  XERO_RETRY_MAX_DELAY_MS,
} from '../constants';
import type { XeroErrorBody } from '../types';
import { XeroAuthService } from './xero-auth.service';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface XeroGetOptions {
  params?: Record<string, string | number>;
  /** ISO timestamp — Xero then returns only records whose UpdatedDateUTC is after it. */
  ifModifiedSince?: string;
}

/**
 * Low-level HTTP client for the Xero Accounting API. Resolves the
 * organization's session (tenant id + fresh access token), sends the
 * `Xero-tenant-id` header every call needs (without it Xero answers 403
 * however valid the token is), retries transient failures, and watches
 * Xero's per-tenant rate-limit headers so a sync backs off *before* tripping
 * a limit. Failures map onto Nest's `HttpException` hierarchy.
 */
@Injectable()
export class XeroApiClientService {
  private readonly logger = new Logger(XeroApiClientService.name);

  // Per tenant: don't send another call before this time (ms epoch). Set
  // when X-MinLimit-Remaining runs low. In-memory, single instance — same
  // scope as the polling lock.
  private readonly pausedUntil = new Map<string, number>();

  constructor(
    private readonly httpService: HttpService,
    private readonly xeroAuth: XeroAuthService,
  ) {}

  async get<T>(
    organizationId: string,
    path: string,
    options: XeroGetOptions = {},
  ): Promise<T> {
    const url = `${XERO_ACCOUNTING_BASE_URL}${path}`;
    return this.requestWithRetry<T>(organizationId, url, options, 1);
  }

  private async requestWithRetry<T>(
    organizationId: string,
    url: string,
    options: XeroGetOptions,
    attempt: number,
  ): Promise<T> {
    // Resolved per attempt so a retry after a long pause still has a fresh token.
    const { tenantId, accessToken } =
      await this.xeroAuth.getSessionForOrganization(organizationId);
    await this.waitForRateLimit(tenantId);

    try {
      const response = await firstValueFrom(
        this.httpService
          .get<T>(url, {
            params: options.params,
            // 304 = nothing changed since If-Modified-Since — not an error.
            validateStatus: (status) =>
              (status >= 200 && status < 300) ||
              status === Number(HttpStatus.NOT_MODIFIED),
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Xero-tenant-id': tenantId,
              Accept: 'application/json',
              ...(options.ifModifiedSince
                ? { 'If-Modified-Since': options.ifModifiedSince }
                : {}),
            },
          })
          .pipe(timeout(XERO_REQUEST_TIMEOUT_MS)),
      );
      this.trackRateLimit(tenantId, response);
      // Callers read list envelopes defensively (`data.Invoices ?? []`), so an
      // empty object is a safe stand-in for a 304's empty body.
      return response.status === Number(HttpStatus.NOT_MODIFIED)
        ? ({} as T)
        : response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        this.trackRateLimit(tenantId, error.response);
      }

      const retryDelayMs = this.retryDelayMs(error, attempt);
      if (retryDelayMs !== null) {
        this.logger.warn(
          `Transient Xero failure on attempt ${attempt}/${XERO_MAX_RETRY_ATTEMPTS} — retrying in ${retryDelayMs}ms: ${url}`,
        );
        await sleep(retryDelayMs);
        return this.requestWithRetry<T>(
          organizationId,
          url,
          options,
          attempt + 1,
        );
      }
      return this.handleError(error, url);
    }
  }

  private async waitForRateLimit(tenantId: string): Promise<void> {
    const until = this.pausedUntil.get(tenantId);
    if (!until) return;

    const waitMs = until - Date.now();
    if (waitMs > 0) {
      this.logger.warn(
        `Xero minute limit nearly used for tenant ${tenantId} — pausing ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
    this.pausedUntil.delete(tenantId);
  }

  /**
   * Reads X-MinLimit-Remaining / X-DayLimit-Remaining off every response.
   * Low minute budget → pause this tenant's next call. Low daily budget →
   * stop now, since carrying on would lock the client out for the rest of
   * the day.
   */
  private trackRateLimit(
    tenantId: string,
    response: Pick<AxiosResponse, 'headers'>,
  ): void {
    const headers = response.headers as Record<string, unknown>;
    const minRemaining = Number(headers['x-minlimit-remaining']);
    const dayRemaining = Number(headers['x-daylimit-remaining']);

    if (
      Number.isFinite(minRemaining) &&
      minRemaining <= XERO_MIN_LIMIT_THRESHOLD
    ) {
      this.pausedUntil.set(tenantId, Date.now() + XERO_MIN_LIMIT_PAUSE_MS);
    }

    if (
      Number.isFinite(dayRemaining) &&
      dayRemaining <= XERO_DAY_LIMIT_THRESHOLD
    ) {
      throw new HttpException(
        `Xero daily API limit nearly exhausted for this organisation (${dayRemaining} calls left) — sync paused until tomorrow`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** `null` means "not retryable" — fail now. */
  private retryDelayMs(error: unknown, attempt: number): number | null {
    if (attempt >= XERO_MAX_RETRY_ATTEMPTS) return null;
    if (error instanceof HttpException) return null;
    if (!axios.isAxiosError(error) || !error.response) {
      return this.backoffMs(attempt);
    }

    const status = error.response.status;
    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
      const headers = error.response.headers as Record<string, unknown>;
      // Xero only sends Retry-After for the minute/concurrent limits; a 429
      // with the daily limit hit ("X-Rate-Limit-Problem: day") isn't worth retrying.
      const problem = headers['x-rate-limit-problem'];
      if (typeof problem === 'string' && problem.toLowerCase() === 'day') {
        return null;
      }

      const retryAfterSeconds = Number(headers['retry-after']);
      return Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
        ? retryAfterSeconds * 1000
        : this.backoffMs(attempt);
    }

    return status >= 500 ? this.backoffMs(attempt) : null;
  }

  private backoffMs(attempt: number): number {
    return Math.min(
      XERO_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
      XERO_RETRY_MAX_DELAY_MS,
    );
  }

  private handleError(error: unknown, url: string): never {
    if (error instanceof HttpException) throw error;

    if (!axios.isAxiosError<XeroErrorBody>(error) || !error.response) {
      this.logger.error(
        `Xero request to ${url} failed without a response: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Xero is unreachable — try again shortly',
      );
    }

    const status = error.response.status;
    const data = error.response.data;
    const message =
      data?.Detail ?? data?.Message ?? data?.Title ?? error.message;
    this.logger.error(`Xero request to ${url} failed (${status}): ${message}`);

    if (
      status === Number(HttpStatus.UNAUTHORIZED) ||
      status === Number(HttpStatus.FORBIDDEN)
    ) {
      throw new UnauthorizedException(
        'Xero rejected the request — reconnect at /xero/connect',
      );
    }
    if (status === Number(HttpStatus.NOT_FOUND)) {
      throw new NotFoundException(`Xero resource not found: ${message}`);
    }
    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
      throw new HttpException(
        'Xero rate limit exceeded — try again shortly',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (status >= 500) {
      throw new ServiceUnavailableException(
        `Xero is currently unavailable: ${message}`,
      );
    }
    throw new BadGatewayException(`Xero request failed: ${message}`);
  }
}
