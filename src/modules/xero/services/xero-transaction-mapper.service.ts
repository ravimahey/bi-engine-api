import { Injectable, Logger } from '@nestjs/common';
import {
  ExpenseTransactionType,
  SourceSystem,
} from '@modules/records/entities';
import {
  RecordsLookupService,
  RecordsRemovalService,
  RecordsService,
} from '@modules/records/services';
import type { UpsertExpenseTransactionLineInput } from '@modules/records/types';
import {
  XERO_FALLBACK_CURRENCY,
  XERO_LIVE_BANK_TRANSACTION_STATUSES,
  XERO_LIVE_INVOICE_STATUSES,
} from '../constants';
import type {
  XeroBankTransactionPayload,
  XeroInvoicePayload,
  XeroLineAmountTypes,
  XeroLineItemPayload,
  XeroMapContext,
  XeroReferenceIndex,
} from '../types';
import {
  cachedLookup,
  netLineAmount,
  netUnitPrice,
  pickXeroDate,
  resolveLineAccountId,
  resolveLineItemId,
  xeroProvenance,
} from '../utils';
import type { XeroLookupCache } from '../utils';

/** Bills and spend bank transactions, once normalized to one header shape. */
interface XeroExpenseHeader {
  type: ExpenseTransactionType;
  externalId: string;
  contactId: string | undefined;
  date: string | null;
  dueDate: string | null;
  total: number | undefined;
  balance: number | null;
  currency: string | undefined;
  note: string | null;
  paymentMethod: string | null;
  lineAmountTypes: XeroLineAmountTypes | undefined;
  lines: XeroLineItemPayload[];
}

/**
 * Translates Xero's two spend-transaction sources (Steps 6–7) into
 * canonical `ExpenseTransaction` rows at line-item grain. Xero has no Bill
 * object: bills are `Invoices` with `Type=ACCPAY` (ACCREC is revenue and
 * never lands here), and card/bank spend is `BankTransactions` with
 * `Type=SPEND`. A bill or spend whose status means it's no longer spend
 * (VOIDED, DELETED, back to DRAFT) is removed from the canonical layer so an
 * earlier sync can't leave it inflating totals.
 * `XeroCreditPaymentMapperService` covers credit notes and payments.
 */
@Injectable()
export class XeroTransactionMapperService {
  private readonly logger = new Logger(XeroTransactionMapperService.name);

  constructor(
    private readonly recordsService: RecordsService,
    private readonly recordsRemoval: RecordsRemovalService,
    private readonly recordsLookup: RecordsLookupService,
  ) {}

  /** Step 6 — Invoices (ACCPAY) → ExpenseTransaction (bill). */
  async mapInvoices(
    records: XeroInvoicePayload[],
    context: XeroMapContext,
    index: XeroReferenceIndex,
  ): Promise<number> {
    const cache: XeroLookupCache = new Map();
    const bills = records.filter((invoice) => invoice.Type === 'ACCPAY');

    for (const bill of bills) {
      if (!XERO_LIVE_INVOICE_STATUSES.includes(bill.Status ?? '')) {
        await this.remove(context, bill.InvoiceID);
        continue;
      }

      await this.upsertExpense(context, index, cache, {
        type: ExpenseTransactionType.BILL,
        externalId: bill.InvoiceID,
        contactId: bill.Contact?.ContactID,
        date: pickXeroDate(bill.DateString, bill.Date),
        dueDate: pickXeroDate(bill.DueDateString, bill.DueDate),
        total: bill.Total,
        balance: bill.AmountDue ?? null,
        currency: bill.CurrencyCode,
        note: bill.InvoiceNumber || bill.Reference || null,
        paymentMethod: null,
        lineAmountTypes: bill.LineAmountTypes,
        lines: bill.LineItems ?? [],
      });
    }

    this.log('bills', bills.length, context);
    return bills.length;
  }

  /** Step 7 — BankTransactions (SPEND) → ExpenseTransaction (purchase). */
  async mapBankTransactions(
    records: XeroBankTransactionPayload[],
    context: XeroMapContext,
    index: XeroReferenceIndex,
  ): Promise<number> {
    const cache: XeroLookupCache = new Map();
    const spends = records.filter((txn) => txn.Type === 'SPEND');

    for (const spend of spends) {
      if (!XERO_LIVE_BANK_TRANSACTION_STATUSES.includes(spend.Status ?? '')) {
        await this.remove(context, spend.BankTransactionID);
        continue;
      }

      await this.upsertExpense(context, index, cache, {
        type: ExpenseTransactionType.PURCHASE,
        externalId: spend.BankTransactionID,
        contactId: spend.Contact?.ContactID,
        date: pickXeroDate(spend.DateString, spend.Date),
        dueDate: null,
        total: spend.Total,
        balance: null,
        currency: spend.CurrencyCode,
        note: spend.Reference || null,
        // Which bank account the money left from — the closest Xero has to
        // QuickBooks' Purchase.PaymentType.
        paymentMethod: spend.BankAccount?.Name ?? null,
        lineAmountTypes: spend.LineAmountTypes,
        lines: spend.LineItems ?? [],
      });
    }

    this.log('spend bank transactions', spends.length, context);
    return spends.length;
  }

  private async upsertExpense(
    context: XeroMapContext,
    index: XeroReferenceIndex,
    cache: XeroLookupCache,
    header: XeroExpenseHeader,
  ): Promise<void> {
    if (!header.date) {
      this.logger.warn(
        `Skipping Xero ${header.type} ${header.externalId}: no parseable date`,
      );
      return;
    }

    const currency =
      header.currency || context.baseCurrency || XERO_FALLBACK_CURRENCY;
    const lines: UpsertExpenseTransactionLineInput[] = [];
    for (const [position, line] of header.lines.entries()) {
      lines.push(
        await this.mapLine(context, index, cache, line, position, {
          lineAmountTypes: header.lineAmountTypes,
          currency,
        }),
      );
    }

    await this.recordsService.upsertExpenseTransaction({
      ...xeroProvenance(context, header.externalId),
      transactionType: header.type,
      vendorId: await cachedLookup(cache, 'vendor', header.contactId, (id) =>
        this.recordsLookup.findVendorId(
          context.organizationId,
          SourceSystem.XERO,
          id,
        ),
      ),
      transactionDate: header.date,
      dueDate: header.dueDate,
      totalAmount: String(header.total ?? 0),
      currency,
      balance: header.balance != null ? String(header.balance) : null,
      paymentMethod: header.paymentMethod,
      privateNote: header.note,
      lines,
    });
  }

  private async mapLine(
    context: XeroMapContext,
    index: XeroReferenceIndex,
    cache: XeroLookupCache,
    line: XeroLineItemPayload,
    position: number,
    options: {
      lineAmountTypes: XeroLineAmountTypes | undefined;
      currency: string;
    },
  ): Promise<UpsertExpenseTransactionLineInput> {
    const { organizationId } = context;
    const source = SourceSystem.XERO;

    return {
      externalLineId: line.LineItemID ?? `line-${position + 1}`,
      categoryId: await cachedLookup(
        cache,
        'category',
        resolveLineAccountId(line, index),
        (id) => this.recordsLookup.findCategoryId(organizationId, source, id),
      ),
      itemId: await cachedLookup(
        cache,
        'item',
        resolveLineItemId(line, index),
        (id) => this.recordsLookup.findItemId(organizationId, source, id),
      ),
      // Xero tax rates are keyed by TaxType (see XeroMasterDataMapperService.mapTaxRates).
      taxRateId: await cachedLookup(cache, 'taxRate', line.TaxType, (id) =>
        this.recordsLookup.findTaxRateId(organizationId, source, id),
      ),
      taxCodeExternalRef: line.TaxType ?? null,
      description: line.Description ?? null,
      lineNumber: position + 1,
      amount: netLineAmount(line, options.lineAmountTypes),
      quantity: line.Quantity != null ? String(line.Quantity) : null,
      unitPrice: netUnitPrice(line, options.lineAmountTypes),
      currency: options.currency,
    };
  }

  private remove(context: XeroMapContext, externalId: string) {
    return this.recordsRemoval.removeExpenseTransaction(
      context.organizationId,
      SourceSystem.XERO,
      externalId,
    );
  }

  private log(label: string, count: number, context: XeroMapContext): void {
    this.logger.log(
      `Mapped ${count} Xero ${label} for connection ${context.sourceConnectionId}`,
    );
  }
}
