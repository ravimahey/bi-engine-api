import { Injectable } from '@nestjs/common';
import {
  QUICKBOOKS_MAX_PAGE_SIZE,
  QUICKBOOKS_MINOR_VERSION,
} from '../constants';
import type {
  QuickbooksCompanyInfoResponse,
  QuickbooksQueryEntity,
  QuickbooksQueryResponse,
} from '../types';
import { QuickbooksApiClientService } from './quickbooks-api-client.service';

/**
 * Read-only wrapper around the QuickBooks Accounting API's master data and
 * spend transactions — the QuickBooks API Build Order's steps 0 through 8.
 * Knows nothing about tokens or HTTP mechanics; that's
 * `QuickbooksApiClientService`'s job, and `QuickbooksAuthService`'s before
 * that.
 */
@Injectable()
export class QuickbooksService {
  constructor(private readonly apiClient: QuickbooksApiClientService) {}

  /**
   * Step 0 — confirms the connection and exposes fiscal year/currency.
   * `organizationId`, when given, scopes the session to that organization's
   * own `ProviderConnection` — the polling layer always passes it, same
   * reasoning as `fetchAllPages`/`queryPage` below. Omitted, it falls back
   * to the legacy single-tenant session, unchanged for the interactive
   * `GET /quickbooks/company-info` endpoint.
   *
   * Unlike every other entity, this endpoint doesn't return its fields at
   * the top level — QuickBooks nests them under `CompanyInfo` (see
   * `QuickbooksCompanyInfoResponse`), so this unwraps it the same way
   * `query()` below unwraps `QueryResponse[entity]`.
   */
  async getCompanyInfo(organizationId?: string): Promise<unknown> {
    const data = await this.apiClient.get<QuickbooksCompanyInfoResponse>(
      (realmId) =>
        `/companyinfo/${realmId}?minorversion=${QUICKBOOKS_MINOR_VERSION}`,
      organizationId,
    );
    console.log('QuickBooks company info response:=======', data);
    return data.CompanyInfo ?? null;
  }

  // Step 1 — supplier master data every Bill/Purchase/VendorCredit references.
  getVendors(): Promise<unknown[]> {
    return this.query('Vendor');
  }

  // Step 2 — chart-of-accounts category buckets line items are grouped by.
  getAccounts(): Promise<unknown[]> {
    return this.query('Account');
  }

  // Step 3 — the specific product/service on a line item.
  getItems(): Promise<unknown[]> {
    return this.query('Item');
  }

  // Step 4 — kept separate from transaction amounts so a tax-rate change
  // can't be mistaken for a genuine supplier price increase.
  getTaxCodes(): Promise<unknown[]> {
    return this.query('TaxCode');
  }

  getTaxRates(): Promise<unknown[]> {
    return this.query('TaxRate');
  }

  // Step 5 — the core AP expense record findings are built from.
  getBills(): Promise<unknown[]> {
    return this.query('Bill');
  }

  // Step 6 — card/cash spend that never goes through the Bill/AP workflow.
  getExpenses(): Promise<unknown[]> {
    return this.query('Purchase');
  }

  // Step 7 — nets supplier refunds against the spend they originally hit.
  getVendorCredits(): Promise<unknown[]> {
    return this.query('VendorCredit');
  }

  // Step 8 — when a bill was actually paid, for AP aging/payment timing.
  getBillPayments(): Promise<unknown[]> {
    return this.query('BillPayment');
  }

  getInvoices(): Promise<unknown[]> {
    return this.query('Invoice');
  }

  // Step 11 — point-of-sale/paid-on-the-spot sales, the revenue mirror of Purchase.
  getSalesReceipts(): Promise<unknown[]> {
    return this.query('SalesReceipt');
  }

  // Step 11 — when an invoice was actually paid, the revenue mirror of BillPayment.
  getPayments(): Promise<unknown[]> {
    return this.query('Payment');
  }

  // Step 11 — customer master data every Invoice/SalesReceipt/Payment references.
  getCustomers(): Promise<unknown[]> {
    return this.query('Customer');
  }

  private async query(entity: QuickbooksQueryEntity): Promise<unknown[]> {
    const q = `SELECT * FROM ${entity}`;
    const data = await this.apiClient.get<QuickbooksQueryResponse<unknown>>(
      () =>
        `/query?query=${encodeURIComponent(q)}&minorversion=${QUICKBOOKS_MINOR_VERSION}`,
    );
    return data.QueryResponse?.[entity] ?? [];
  }

  /**
   * One page of `entity`, optionally filtered by a raw QuickBooks `WHERE`
   * clause (e.g. `TxnDate >= '2026-01-05' AND TxnDate < '2026-02-05'`) —
   * the polling layer's date-chunk filter, kept separate from pagination
   * itself. `startPosition` is 1-indexed, per QuickBooks' own convention.
   *
   * `organizationId`, when given, scopes the underlying session to that
   * organization's own `ProviderConnection` — see `QuickbooksApiClientService.get`.
   */
  async queryPage(
    entity: QuickbooksQueryEntity,
    options: { startPosition: number; maxResults: number; where?: string },
    organizationId?: string,
  ): Promise<unknown[]> {
    const whereClause = options.where ? ` WHERE ${options.where}` : '';
    const q = `SELECT * FROM ${entity}${whereClause} STARTPOSITION ${options.startPosition} MAXRESULTS ${options.maxResults}`;
    const data = await this.apiClient.get<QuickbooksQueryResponse<unknown>>(
      () =>
        `/query?query=${encodeURIComponent(q)}&minorversion=${QUICKBOOKS_MINOR_VERSION}`,
      organizationId,
    );
    return data.QueryResponse?.[entity] ?? [];
  }

  /**
   * Every record for `entity` (optionally date-filtered via `where`), paging
   * with STARTPOSITION/MAXRESULTS until a short page signals the end. Used
   * by the polling layer once per date chunk — pagination here is purely
   * in-memory/temporary and never confused with the chunk boundaries
   * themselves or with `SyncCursor`.
   *
   * `organizationId`, when given, scopes every page's session to that
   * organization's own `ProviderConnection` — the polling layer always
   * passes it, so a poll can never fetch a different organization's data.
   */
  async fetchAllPages(
    entity: QuickbooksQueryEntity,
    where?: string,
    organizationId?: string,
  ): Promise<unknown[]> {
    const records: unknown[] = [];
    let startPosition = 1;

    for (;;) {
      const page = await this.queryPage(
        entity,
        { startPosition, maxResults: QUICKBOOKS_MAX_PAGE_SIZE, where },
        organizationId,
      );
      records.push(...page);
      if (page.length < QUICKBOOKS_MAX_PAGE_SIZE) break;
      startPosition += QUICKBOOKS_MAX_PAGE_SIZE;
    }

    return records;
  }
}
