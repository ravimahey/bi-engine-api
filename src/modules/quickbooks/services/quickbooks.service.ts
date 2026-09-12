import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAppConfig } from '@common/utils';
import { QuickbooksEnvironment } from '@config';
import { QuickbooksAuthService } from './quickbooks-auth.service';

// QuickBooks entities this service knows how to list. A closed union — not a
// free-form string — so callers can't build an arbitrary `SELECT * FROM`.
type QuickbooksQueryEntity = 'Purchase' | 'Invoice' | 'Bill';

const MINOR_VERSION = 75;

interface QuickbooksFault {
  Fault?: { Error?: Array<{ Message?: string }> };
}

interface QuickbooksQueryResponse<T> {
  QueryResponse?: Partial<Record<QuickbooksQueryEntity, T[]>>;
}

/**
 * Read-only wrapper around the QuickBooks Accounting API. Knows nothing
 * about tokens — it asks `QuickbooksAuthService` for a valid session and
 * spends it on one request.
 */
@Injectable()
export class QuickbooksService {
  constructor(
    private readonly configService: ConfigService,
    private readonly quickbooksAuth: QuickbooksAuthService,
  ) {}

  getCompanyInfo(): Promise<unknown> {
    return this.request(
      (realmId) => `/companyinfo/${realmId}?minorversion=${MINOR_VERSION}`,
    );
  }

  getExpenses(): Promise<unknown[]> {
    return this.query('Purchase');
  }

  getInvoices(): Promise<unknown[]> {
    return this.query('Invoice');
  }

  getBills(): Promise<unknown[]> {
    return this.query('Bill');
  }

  private async query(entity: QuickbooksQueryEntity): Promise<unknown[]> {
    const q = `SELECT * FROM ${entity}`;
    const data = await this.request<QuickbooksQueryResponse<unknown>>(
      () =>
        `/query?query=${encodeURIComponent(q)}&minorversion=${MINOR_VERSION}`,
    );
    return data.QueryResponse?.[entity] ?? [];
  }

  private async request<T = unknown>(
    path: (realmId: string) => string,
  ): Promise<T> {
    const { realmId, accessToken } = await this.quickbooksAuth.getSession();
    const url = `${this.baseUrl()}/v3/company/${realmId}${path(realmId)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => undefined)) as
        QuickbooksFault | undefined;
      const message = body?.Fault?.Error?.[0]?.Message ?? res.statusText;
      throw new InternalServerErrorException(
        `QuickBooks request failed: ${message}`,
      );
    }

    return res.json() as Promise<T>;
  }

  private baseUrl(): string {
    const { quickbooks } = getAppConfig(this.configService);
    return quickbooks.environment === QuickbooksEnvironment.Production
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';
  }
}
