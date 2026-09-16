import { Injectable, Logger } from '@nestjs/common';
import { SalesTransactionType, SourceSystem } from '@modules/records/entities';
import {
  RecordsLookupService,
  RecordsRevenueService,
} from '@modules/records/services';
import type { UpsertSalesTransactionLineInput } from '@modules/records/types';
import { DEFAULT_CURRENCY } from '../constants';
import type {
  QuickbooksCustomerPayload,
  QuickbooksInvoicePayload,
  QuickbooksLinePayload,
  QuickbooksMapContext,
  QuickbooksPaymentPayload,
  QuickbooksSalesReceiptPayload,
} from '../types';

/** Header fields shared by Invoice and SalesReceipt once each is normalized to this shape. */
interface RawSalesHeader {
  transactionType: SalesTransactionType;
  externalId: string;
  customerExternalId: string | null;
  transactionDate: string;
  dueDate: string | null;
  totalAmount: string;
  balance: string | null;
  privateNote: string | null;
  lines: QuickbooksLinePayload[];
}

/**
 * Translates QuickBooks revenue-side entities — Customer/Invoice/
 * SalesReceipt/Payment, Step 11 of the build order — directly from the
 * fetched API JSON into the canonical records/* shape, in one pass. The
 * revenue-side sibling of `QuickbooksTransactionMapperService` (which covers
 * Bill/Purchase/VendorCredit/BillPayment) and `QuickbooksMasterDataMapperService`
 * (Customer's counterpart there, Vendor). No raw intermediate table — same
 * direct-to-canonical style established across the module.
 */
@Injectable()
export class QuickbooksRevenueMapperService {
  private readonly logger = new Logger(QuickbooksRevenueMapperService.name);

  constructor(
    private readonly recordsRevenue: RecordsRevenueService,
    private readonly recordsLookup: RecordsLookupService,
  ) {}

  async mapCustomers(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksCustomerPayload[];

    for (const raw of raws) {
      await this.recordsRevenue.upsertCustomer({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: String(raw.Id),
        sourceConnectionId: context.sourceConnectionId,
        displayName: raw.DisplayName,
        isActive: raw.Active ?? true,
        balance: raw.Balance != null ? String(raw.Balance) : null,
        email: raw.PrimaryEmailAddr?.Address ?? null,
        phone: raw.PrimaryPhone?.FreeFormNumber ?? null,
      });
    }

    this.logger.log(
      `Mapped ${raws.length} customers for connection ${context.sourceConnectionId}`,
    );
  }

  async mapInvoices(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksInvoicePayload[];

    for (const raw of raws) {
      await this.mapSalesTransaction(context, {
        transactionType: SalesTransactionType.INVOICE,
        externalId: String(raw.Id),
        customerExternalId: raw.CustomerRef?.value ?? null,
        transactionDate: raw.TxnDate,
        dueDate: raw.DueDate ?? null,
        totalAmount: String(raw.TotalAmt),
        balance: raw.Balance != null ? String(raw.Balance) : null,
        privateNote: raw.PrivateNote ?? null,
        lines: raw.Line ?? [],
      });
    }

    this.logger.log(
      `Mapped ${raws.length} invoices for connection ${context.sourceConnectionId}`,
    );
  }

  async mapSalesReceipts(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksSalesReceiptPayload[];

    for (const raw of raws) {
      await this.mapSalesTransaction(context, {
        transactionType: SalesTransactionType.SALES_RECEIPT,
        externalId: String(raw.Id),
        customerExternalId: raw.CustomerRef?.value ?? null,
        transactionDate: raw.TxnDate,
        dueDate: null,
        totalAmount: String(raw.TotalAmt),
        balance: null,
        privateNote: raw.PrivateNote ?? null,
        lines: raw.Line ?? [],
      });
    }

    this.logger.log(
      `Mapped ${raws.length} sales receipts for connection ${context.sourceConnectionId}`,
    );
  }

  async mapPayments(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksPaymentPayload[];

    for (const raw of raws) {
      const customerId = await this.resolveCustomerId(
        context,
        raw.CustomerRef?.value ?? null,
      );

      await this.recordsRevenue.upsertCustomerPayment({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: String(raw.Id),
        sourceConnectionId: context.sourceConnectionId,
        customerId,
        paymentDate: raw.TxnDate,
        totalAmount: String(raw.TotalAmt),
        currency: DEFAULT_CURRENCY,
        appliedTransactions: (raw.Line ?? []).flatMap((line) =>
          (line.LinkedTxn ?? [])
            .filter((linked) => linked.TxnType === 'Invoice' && linked.TxnId)
            .map((linked) => ({
              invoiceExternalId: linked.TxnId,
              amount: line.Amount != null ? String(line.Amount) : null,
            })),
        ),
      });
    }

    this.logger.log(
      `Mapped ${raws.length} payments for connection ${context.sourceConnectionId}`,
    );
  }

  private async mapSalesTransaction(
    context: QuickbooksMapContext,
    header: RawSalesHeader,
  ): Promise<void> {
    const customerId = await this.resolveCustomerId(
      context,
      header.customerExternalId,
    );

    const lines: UpsertSalesTransactionLineInput[] = [];
    for (const rawLine of this.filterLines(header.lines)) {
      lines.push(await this.mapLine(context, rawLine));
    }

    await this.recordsRevenue.upsertSalesTransaction({
      organizationId: context.organizationId,
      sourceSystem: SourceSystem.QUICKBOOKS,
      sourceExternalId: header.externalId,
      sourceConnectionId: context.sourceConnectionId,
      transactionType: header.transactionType,
      customerId,
      transactionDate: header.transactionDate,
      dueDate: header.dueDate,
      totalAmount: header.totalAmount,
      currency: DEFAULT_CURRENCY,
      balance: header.balance,
      privateNote: header.privateNote,
      lines,
    });
  }

  /** Keeps only lines carrying `SalesItemLineDetail` — drops `SubTotalLineDetail`/`DiscountLineDetail` entries, no `ItemRef`/grain worth storing. */
  private filterLines(lines: QuickbooksLinePayload[]): QuickbooksLinePayload[] {
    return lines.filter(
      (line) => line.Id != null && line.DetailType === 'SalesItemLineDetail',
    );
  }

  private async mapLine(
    context: QuickbooksMapContext,
    rawLine: QuickbooksLinePayload,
  ): Promise<UpsertSalesTransactionLineInput> {
    const detail = rawLine.SalesItemLineDetail;
    const itemExternalId = detail?.ItemRef?.value ?? null;
    const accountExternalId = detail?.ItemAccountRef?.value ?? null;

    const categoryId = accountExternalId
      ? await this.recordsLookup.findCategoryId(
          context.organizationId,
          SourceSystem.QUICKBOOKS,
          accountExternalId,
        )
      : null;

    const itemId = itemExternalId
      ? await this.recordsLookup.findItemId(
          context.organizationId,
          SourceSystem.QUICKBOOKS,
          itemExternalId,
        )
      : null;

    const taxCodeRef = detail?.TaxCodeRef?.value ?? null;
    const taxRateId = taxCodeRef
      ? await this.recordsLookup.findSalesTaxRateIdForTaxCode(
          context.organizationId,
          SourceSystem.QUICKBOOKS,
          taxCodeRef,
        )
      : null;

    return {
      externalLineId: String(rawLine.Id),
      categoryId,
      itemId,
      taxRateId,
      taxCodeExternalRef: taxCodeRef,
      description: rawLine.Description ?? null,
      lineNumber: rawLine.LineNum ?? null,
      amount: String(rawLine.Amount ?? 0),
      quantity: detail?.Qty != null ? String(detail.Qty) : null,
      unitPrice: detail?.UnitPrice != null ? String(detail.UnitPrice) : null,
      currency: DEFAULT_CURRENCY,
    };
  }

  private resolveCustomerId(
    context: QuickbooksMapContext,
    customerExternalId: string | null,
  ): Promise<string | null> {
    if (!customerExternalId) return Promise.resolve(null);

    return this.recordsLookup.findCustomerId(
      context.organizationId,
      SourceSystem.QUICKBOOKS,
      customerExternalId,
    );
  }
}
