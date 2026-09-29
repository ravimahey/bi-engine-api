import { Injectable, Logger } from '@nestjs/common';
import { SourceSystem } from '@modules/records/entities';
import {
  RecordsLookupService,
  RecordsRemovalService,
  RecordsService,
} from '@modules/records/services';
import {
  XERO_FALLBACK_CURRENCY,
  XERO_LIVE_INVOICE_STATUSES,
  XERO_LIVE_PAYMENT_STATUSES,
} from '../constants';
import type {
  XeroCreditNotePayload,
  XeroMapContext,
  XeroPaymentPayload,
  XeroReferenceIndex,
} from '../types';
import {
  cachedLookup,
  netLineAmount,
  pickXeroDate,
  resolveLineAccountId,
  resolveLineItemId,
  xeroProvenance,
} from '../utils';
import type { XeroLookupCache } from '../utils';

/**
 * Steps 8–9: supplier credit notes (`CreditNotes`, `Type=ACCPAYCREDIT`) →
 * `VendorCredit`, and bill payments (`Payments`, `ACCPAYPAYMENT`) →
 * `TransactionPayment`. Customer-side credit notes (ACCRECCREDIT) and
 * payments are revenue and are skipped. Voided/deleted records are removed
 * from the canonical layer, same rule as `XeroTransactionMapperService`.
 */
@Injectable()
export class XeroCreditPaymentMapperService {
  private readonly logger = new Logger(XeroCreditPaymentMapperService.name);

  constructor(
    private readonly recordsService: RecordsService,
    private readonly recordsRemoval: RecordsRemovalService,
    private readonly recordsLookup: RecordsLookupService,
  ) {}

  /** Step 8 — nets supplier refunds/overcharge corrections against the spend they hit. */
  async mapCreditNotes(
    records: XeroCreditNotePayload[],
    context: XeroMapContext,
    index: XeroReferenceIndex,
  ): Promise<number> {
    const cache: XeroLookupCache = new Map();
    const credits = records.filter((note) => note.Type === 'ACCPAYCREDIT');

    for (const credit of credits) {
      const date = pickXeroDate(credit.DateString, credit.Date);
      if (!date || !XERO_LIVE_INVOICE_STATUSES.includes(credit.Status ?? '')) {
        await this.recordsRemoval.removeVendorCredit(
          context.organizationId,
          SourceSystem.XERO,
          credit.CreditNoteID,
        );
        continue;
      }

      await this.recordsService.upsertVendorCredit({
        ...xeroProvenance(context, credit.CreditNoteID),
        vendorId: await this.vendorId(
          cache,
          context,
          credit.Contact?.ContactID,
        ),
        transactionDate: date,
        totalAmount: String(credit.Total ?? 0),
        currency: this.currency(credit.CurrencyCode, context),
        // Same denormalized line shape the QuickBooks mapper writes, so a
        // credit nets against the category/item it originally hit.
        lines: (credit.LineItems ?? []).map((line) => ({
          accountExternalId: resolveLineAccountId(line, index),
          itemExternalId: resolveLineItemId(line, index),
          amount: netLineAmount(line, credit.LineAmountTypes),
          taxCodeRef: line.TaxType ?? null,
        })),
      });
    }

    this.log('supplier credit notes', credits.length, context);
    return credits.length;
  }

  /** Step 9 — when a bill was actually paid, and from which bank account. */
  async mapPayments(
    records: XeroPaymentPayload[],
    context: XeroMapContext,
  ): Promise<number> {
    const cache: XeroLookupCache = new Map();
    const billPayments = records.filter(
      (payment) => payment.PaymentType === 'ACCPAYPAYMENT',
    );

    for (const payment of billPayments) {
      const date = pickXeroDate(undefined, payment.Date);
      if (!date || !XERO_LIVE_PAYMENT_STATUSES.includes(payment.Status ?? '')) {
        await this.recordsRemoval.removeTransactionPayment(
          context.organizationId,
          SourceSystem.XERO,
          payment.PaymentID,
        );
        continue;
      }

      const amount = String(payment.Amount ?? 0);
      await this.recordsService.upsertTransactionPayment({
        ...xeroProvenance(context, payment.PaymentID),
        vendorId: await this.vendorId(
          cache,
          context,
          payment.Invoice?.Contact?.ContactID,
        ),
        paymentDate: date,
        totalAmount: amount,
        currency: this.currency(payment.Invoice?.CurrencyCode, context),
        paymentMethod: null,
        // Same `{ billExternalId, amount }` shape as QuickBooks, plus the bank
        // account the payment came from (TransactionPayment has no column for it).
        appliedTransactions: payment.Invoice?.InvoiceID
          ? [
              {
                billExternalId: payment.Invoice.InvoiceID,
                amount,
                bankAccountExternalId: payment.Account?.AccountID ?? null,
              },
            ]
          : [],
      });
    }

    this.log('bill payments', billPayments.length, context);
    return billPayments.length;
  }

  private vendorId(
    cache: XeroLookupCache,
    context: XeroMapContext,
    contactId: string | undefined,
  ): Promise<string | null> {
    return cachedLookup(cache, 'vendor', contactId, (id) =>
      this.recordsLookup.findVendorId(
        context.organizationId,
        SourceSystem.XERO,
        id,
      ),
    );
  }

  private currency(code: string | undefined, context: XeroMapContext): string {
    return code || context.baseCurrency || XERO_FALLBACK_CURRENCY;
  }

  private log(label: string, count: number, context: XeroMapContext): void {
    this.logger.log(
      `Mapped ${count} Xero ${label} for connection ${context.sourceConnectionId}`,
    );
  }
}
