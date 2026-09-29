import { Injectable } from '@nestjs/common';
import { XERO_MAX_PAGE_SIZE, XERO_PAGED_ENTITIES } from '../constants';
import type { XeroPollEntity } from '../constants';
import type { XeroOrganisationPayload } from '../types';
import { XeroApiClientService } from './xero-api-client.service';

export interface XeroFetchOptions {
  /** Xero `where` expression, e.g. `Type=="ACCPAY"`. */
  where?: string;
  /** ISO timestamp — only records modified after it (Step 10 incremental sync). */
  ifModifiedSince?: string;
}

/**
 * Read-only wrapper over the Xero Accounting API endpoints in the build
 * order (Steps 1–9). Knows endpoint paths, response envelopes and
 * pagination; knows nothing about tokens, headers or retries
 * (`XeroApiClientService`), or about the canonical model (the mappers).
 */
@Injectable()
export class XeroService {
  constructor(private readonly apiClient: XeroApiClientService) {}

  /** Step 1 — confirms the connection is live and exposes base currency / financial year. */
  async getOrganisation(
    organizationId: string,
  ): Promise<XeroOrganisationPayload | null> {
    const data = await this.apiClient.get<{
      Organisations?: XeroOrganisationPayload[];
    }>(organizationId, '/Organisation');
    return data.Organisations?.[0] ?? null;
  }

  /**
   * Every record of `entity`. Paged endpoints are walked with an explicit
   * `pageSize` of 1000 until a short page; paging also makes Invoices,
   * BankTransactions and CreditNotes include their `LineItems`, which Xero
   * leaves out of unpaged list responses. Accounts, Items and TaxRates
   * aren't paged and come back whole in one call.
   */
  async fetchAll<T>(
    organizationId: string,
    entity: XeroPollEntity,
    options: XeroFetchOptions = {},
  ): Promise<T[]> {
    const baseParams: Record<string, string | number> = options.where
      ? { where: options.where }
      : {};

    if (!XERO_PAGED_ENTITIES.includes(entity)) {
      return this.fetchPage<T>(organizationId, entity, baseParams, options);
    }

    const records: T[] = [];
    for (let page = 1; ; page += 1) {
      const rows = await this.fetchPage<T>(
        organizationId,
        entity,
        { ...baseParams, page, pageSize: XERO_MAX_PAGE_SIZE },
        options,
      );
      records.push(...rows);
      if (rows.length < XERO_MAX_PAGE_SIZE) break;
    }
    return records;
  }

  private async fetchPage<T>(
    organizationId: string,
    entity: XeroPollEntity,
    params: Record<string, string | number>,
    options: XeroFetchOptions,
  ): Promise<T[]> {
    // Every list endpoint wraps its rows in a key named after the endpoint.
    const data = await this.apiClient.get<Partial<Record<XeroPollEntity, T[]>>>(
      organizationId,
      `/${entity}`,
      { params, ifModifiedSince: options.ifModifiedSince },
    );
    return data[entity] ?? [];
  }
}
