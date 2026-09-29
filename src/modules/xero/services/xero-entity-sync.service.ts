import { Injectable } from '@nestjs/common';
import { XERO_DATED_ENTITIES, XERO_ENTITY_WHERE } from '../constants';
import type { XeroPollEntity } from '../constants';
import type {
  XeroAccountPayload,
  XeroBankTransactionPayload,
  XeroContactPayload,
  XeroCreditNotePayload,
  XeroInvoicePayload,
  XeroItemPayload,
  XeroPaymentPayload,
  XeroReferenceIndex,
  XeroSyncRunState,
  XeroTaxRatePayload,
} from '../types';
import { buildXeroReferenceIndex, toXeroWhereDate } from '../utils';
import { XeroCreditPaymentMapperService } from './xero-credit-payment-mapper.service';
import { XeroMasterDataMapperService } from './xero-master-data-mapper.service';
import { XeroTransactionMapperService } from './xero-transaction-mapper.service';
import { XeroService } from './xero.service';

export interface XeroEntitySyncOptions {
  /** Pass for an incremental pull; omit for a full one. */
  ifModifiedSince?: string;
  /** YYYY-MM-DD lower bound on transaction `Date` — only applied to dated entities. */
  fromDate?: string;
}

/**
 * Fetches one Xero entity and hands the rows to the right mapper — the
 * "what does syncing X mean" logic, kept apart from `XeroPollingService`'s
 * "in what order, with which cursor" orchestration. No raw storage: fetched
 * rows go straight into the canonical records/* tables.
 */
@Injectable()
export class XeroEntitySyncService {
  constructor(
    private readonly xeroService: XeroService,
    private readonly masterDataMapper: XeroMasterDataMapperService,
    private readonly transactionMapper: XeroTransactionMapperService,
    private readonly creditPaymentMapper: XeroCreditPaymentMapperService,
  ) {}

  /** Returns how many rows Xero returned for this entity. */
  async sync(
    entity: XeroPollEntity,
    state: XeroSyncRunState,
    options: XeroEntitySyncOptions,
  ): Promise<number> {
    const { context } = state;
    const fetchOptions = {
      where: this.whereFor(entity, options.fromDate),
      ifModifiedSince: options.ifModifiedSince,
    };
    const fetch = <T>() =>
      this.xeroService.fetchAll<T>(
        context.organizationId,
        entity,
        fetchOptions,
      );

    switch (entity) {
      case 'Contacts': {
        const rows = await fetch<XeroContactPayload>();
        await this.masterDataMapper.mapContacts(rows, context);
        return rows.length;
      }
      case 'Accounts': {
        const rows = await fetch<XeroAccountPayload>();
        await this.masterDataMapper.mapAccounts(rows, context);
        state.accounts = rows;
        state.index = undefined;
        return rows.length;
      }
      case 'Items': {
        const rows = await fetch<XeroItemPayload>();
        await this.masterDataMapper.mapItems(rows, context);
        state.items = rows;
        state.index = undefined;
        return rows.length;
      }
      case 'TaxRates': {
        const rows = await fetch<XeroTaxRatePayload>();
        await this.masterDataMapper.mapTaxRates(rows, context);
        return rows.length;
      }
      case 'Invoices': {
        const rows = await fetch<XeroInvoicePayload>();
        if (rows.length) {
          await this.transactionMapper.mapInvoices(
            rows,
            context,
            await this.referenceIndex(state),
          );
        }
        return rows.length;
      }
      case 'BankTransactions': {
        const rows = await fetch<XeroBankTransactionPayload>();
        if (rows.length) {
          await this.transactionMapper.mapBankTransactions(
            rows,
            context,
            await this.referenceIndex(state),
          );
        }
        return rows.length;
      }
      case 'CreditNotes': {
        const rows = await fetch<XeroCreditNotePayload>();
        if (rows.length) {
          await this.creditPaymentMapper.mapCreditNotes(
            rows,
            context,
            await this.referenceIndex(state),
          );
        }
        return rows.length;
      }
      case 'Payments': {
        const rows = await fetch<XeroPaymentPayload>();
        await this.creditPaymentMapper.mapPayments(rows, context);
        return rows.length;
      }
    }
  }

  private whereFor(
    entity: XeroPollEntity,
    fromDate: string | undefined,
  ): string | undefined {
    const clauses = [XERO_ENTITY_WHERE[entity]];
    if (fromDate && XERO_DATED_ENTITIES.includes(entity)) {
      clauses.push(`Date>=${toXeroWhereDate(fromDate)}`);
    }
    const where = clauses.filter(Boolean).join(' AND ');
    return where || undefined;
  }

  /** The code → GUID index, from this run's Accounts/Items, fetching them (unmapped) only if the run didn't include them. */
  private async referenceIndex(
    state: XeroSyncRunState,
  ): Promise<XeroReferenceIndex> {
    if (state.index) return state.index;

    const { organizationId } = state.context;
    state.accounts ??= await this.xeroService.fetchAll<XeroAccountPayload>(
      organizationId,
      'Accounts',
    );
    state.items ??= await this.xeroService.fetchAll<XeroItemPayload>(
      organizationId,
      'Items',
    );
    state.index = buildXeroReferenceIndex(state.accounts, state.items);
    return state.index;
  }
}
