import { Injectable, Logger } from '@nestjs/common';
import {
  ExpenseTransactionType,
  SourceSystem,
} from '@modules/records/entities';
import {
  RecordsLookupService,
  RecordsService,
} from '@modules/records/services';
import type { UpsertExpenseTransactionLineInput } from '@modules/records/types';
import { DEFAULT_CURRENCY } from '../constants';
import type {
  QuickbooksBillPaymentPayload,
  QuickbooksBillPayload,
  QuickbooksLinePayload,
  QuickbooksMapContext,
  QuickbooksPurchasePayload,
  QuickbooksVendorCreditPayload,
} from '../types';

/** Header fields shared by Bill and Purchase once each is normalized to this shape. */
interface RawTransactionHeader {
  transactionType: ExpenseTransactionType;
  externalId: string;
  vendorExternalId: string | null;
  transactionDate: string;
  dueDate: string | null;
  totalAmount: string;
  balance: string | null;
  paymentMethod: string | null;
  privateNote: string | null;
  lines: QuickbooksLinePayload[];
}

/**
 * Translates QuickBooks transactional entities — Bill/Purchase/VendorCredit/
 * BillPayment, Steps 5-8 of the build order — directly from the fetched API
 * JSON into the canonical records/* shape, in one pass. This is the ONLY
 * place that translates QuickBooks-specific transaction concepts (Bill vs
 * Purchase, ItemBasedExpenseLineDetail vs AccountBasedExpenseLineDetail)
 * into the generic model, so a future Xero mapper is a parallel, independent
 * piece of code rather than a fork of this one. There is deliberately no raw
 * intermediate table — `RecordsService.upsertExpenseTransaction` already
 * writes header and lines in one transaction, so a fetched batch maps
 * straight into canonical rows with no separate line-table round trip.
 * `QuickbooksMasterDataMapperService` is the sibling covering
 * CompanyInfo/Vendor/Account/Item/TaxRate/TaxCode; `QuickbooksRevenueMapperService`
 * is the revenue-side sibling covering Customer/Invoice/SalesReceipt/Payment.
 */
@Injectable()
export class QuickbooksTransactionMapperService {
  private readonly logger = new Logger(QuickbooksTransactionMapperService.name);

  constructor(
    private readonly recordsService: RecordsService,
    private readonly recordsLookup: RecordsLookupService,
  ) {}

  async mapBills(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksBillPayload[];

    for (const raw of raws) {
      await this.mapTransaction(context, {
        transactionType: ExpenseTransactionType.BILL,
        externalId: String(raw.Id),
        vendorExternalId: raw.VendorRef?.value ?? null,
        transactionDate: raw.TxnDate,
        dueDate: raw.DueDate ?? null,
        totalAmount: String(raw.TotalAmt),
        balance: raw.Balance != null ? String(raw.Balance) : null,
        paymentMethod: null,
        privateNote: raw.PrivateNote ?? null,
        lines: raw.Line ?? [],
      });
    }

    this.logger.log(
      `Mapped ${raws.length} bills for connection ${context.sourceConnectionId}`,
    );
  }

  async mapPurchases(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksPurchasePayload[];

    for (const raw of raws) {
      await this.mapTransaction(context, {
        transactionType: ExpenseTransactionType.PURCHASE,
        externalId: String(raw.Id),
        vendorExternalId: raw.EntityRef?.value ?? null,
        transactionDate: raw.TxnDate,
        dueDate: null,
        totalAmount: String(raw.TotalAmt),
        balance: null,
        paymentMethod: raw.PaymentType,
        privateNote: raw.PrivateNote ?? null,
        lines: raw.Line ?? [],
      });
    }

    this.logger.log(
      `Mapped ${raws.length} purchases for connection ${context.sourceConnectionId}`,
    );
  }

  async mapVendorCredits(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksVendorCreditPayload[];

    for (const raw of raws) {
      const vendorId = await this.resolveVendorId(
        context,
        raw.VendorRef?.value ?? null,
      );

      await this.recordsService.upsertVendorCredit({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: String(raw.Id),
        sourceConnectionId: context.sourceConnectionId,
        vendorId,
        transactionDate: raw.TxnDate,
        totalAmount: String(raw.TotalAmt),
        currency: DEFAULT_CURRENCY,
        lines: (raw.Line ?? []).map((line) => this.toDenormalizedLine(line)),
      });
    }

    this.logger.log(
      `Mapped ${raws.length} vendor credits for connection ${context.sourceConnectionId}`,
    );
  }

  async mapBillPayments(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksBillPaymentPayload[];

    for (const raw of raws) {
      const vendorId = await this.resolveVendorId(
        context,
        raw.VendorRef?.value ?? null,
      );

      await this.recordsService.upsertTransactionPayment({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: String(raw.Id),
        sourceConnectionId: context.sourceConnectionId,
        vendorId,
        paymentDate: raw.TxnDate,
        totalAmount: String(raw.TotalAmt),
        currency: DEFAULT_CURRENCY,
        paymentMethod: raw.PayType,
        appliedTransactions: (raw.Line ?? []).flatMap((line) =>
          (line.LinkedTxn ?? [])
            .filter((linked) => linked.TxnType === 'Bill' && linked.TxnId)
            .map((linked) => ({
              billExternalId: linked.TxnId,
              amount: line.Amount != null ? String(line.Amount) : null,
            })),
        ),
      });
    }

    this.logger.log(
      `Mapped ${raws.length} bill payments for connection ${context.sourceConnectionId}`,
    );
  }

  private async mapTransaction(
    context: QuickbooksMapContext,
    header: RawTransactionHeader,
  ): Promise<void> {
    const vendorId = await this.resolveVendorId(
      context,
      header.vendorExternalId,
    );

    const lines: UpsertExpenseTransactionLineInput[] = [];
    for (const rawLine of this.filterLines(header.lines)) {
      lines.push(await this.mapLine(context, rawLine));
    }

    await this.recordsService.upsertExpenseTransaction({
      organizationId: context.organizationId,
      sourceSystem: SourceSystem.QUICKBOOKS,
      sourceExternalId: header.externalId,
      sourceConnectionId: context.sourceConnectionId,
      transactionType: header.transactionType,
      vendorId,
      transactionDate: header.transactionDate,
      dueDate: header.dueDate,
      totalAmount: header.totalAmount,
      currency: DEFAULT_CURRENCY,
      balance: header.balance,
      paymentMethod: header.paymentMethod,
      privateNote: header.privateNote,
      lines,
    });
  }

  /** Keeps only lines carrying an actual expense detail — drops totals/subtotal-only entries QuickBooks may include. */
  private filterLines(lines: QuickbooksLinePayload[]): QuickbooksLinePayload[] {
    return lines.filter(
      (line) =>
        line.Id != null &&
        (line.DetailType === 'ItemBasedExpenseLineDetail' ||
          line.DetailType === 'AccountBasedExpenseLineDetail'),
    );
  }

  private async mapLine(
    context: QuickbooksMapContext,
    rawLine: QuickbooksLinePayload,
  ): Promise<UpsertExpenseTransactionLineInput> {
    const itemDetail = rawLine.ItemBasedExpenseLineDetail;
    const accountDetail = rawLine.AccountBasedExpenseLineDetail;
    const itemExternalId = itemDetail?.ItemRef?.value ?? null;
    const accountExternalId = accountDetail?.AccountRef?.value ?? null;

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

    const taxCodeRef =
      itemDetail?.TaxCodeRef?.value ?? accountDetail?.TaxCodeRef?.value ?? null;
    const taxRateId = taxCodeRef
      ? await this.recordsLookup.findPurchaseTaxRateIdForTaxCode(
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
      quantity: itemDetail?.Qty != null ? String(itemDetail.Qty) : null,
      unitPrice:
        itemDetail?.UnitPrice != null ? String(itemDetail.UnitPrice) : null,
      currency: DEFAULT_CURRENCY,
    };
  }

  private resolveVendorId(
    context: QuickbooksMapContext,
    vendorExternalId: string | null,
  ): Promise<string | null> {
    if (!vendorExternalId) return Promise.resolve(null);

    return this.recordsLookup.findVendorId(
      context.organizationId,
      SourceSystem.QUICKBOOKS,
      vendorExternalId,
    );
  }

  /** `VendorCredit` has no line-child table — `Line[]` is denormalized straight into the canonical row's own jsonb column. */
  private toDenormalizedLine(line: QuickbooksLinePayload): {
    accountExternalId: string | null;
    itemExternalId: string | null;
    amount: string | null;
    taxCodeRef: string | null;
  } {
    const itemDetail = line.ItemBasedExpenseLineDetail;
    const accountDetail = line.AccountBasedExpenseLineDetail;
    return {
      accountExternalId: accountDetail?.AccountRef?.value ?? null,
      itemExternalId: itemDetail?.ItemRef?.value ?? null,
      amount: line.Amount != null ? String(line.Amount) : null,
      taxCodeRef:
        itemDetail?.TaxCodeRef?.value ??
        accountDetail?.TaxCodeRef?.value ??
        null,
    };
  }
}
