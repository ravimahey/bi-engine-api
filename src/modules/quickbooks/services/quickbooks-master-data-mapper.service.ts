import { Injectable, Logger } from '@nestjs/common';
import { ItemType, SourceSystem } from '@modules/records/entities';
import {
  RecordsLookupService,
  RecordsService,
} from '@modules/records/services';
import { DEFAULT_CURRENCY } from '../constants';
import type {
  QuickbooksAccountPayload,
  QuickbooksCompanyInfoPayload,
  QuickbooksItemPayload,
  QuickbooksMapContext,
  QuickbooksTaxCodePayload,
  QuickbooksTaxRatePayload,
  QuickbooksVendorPayload,
} from '../types';

const ITEM_TYPE_BY_QUICKBOOKS_TYPE: Record<string, ItemType> = {
  Inventory: ItemType.INVENTORY,
  NonInventory: ItemType.NON_INVENTORY,
  Service: ItemType.SERVICE,
};

/**
 * Translates QuickBooks master data — Vendor/Account/Item/TaxRate, Steps
 * 1-4 of the build order — directly from the fetched API JSON into the
 * canonical records/* shape, in one pass. This is the only place that knows
 * these QuickBooks field names; `RecordsService` never hears about them.
 * `QuickbooksTransactionMapperService` is the sibling covering
 * Bill/Purchase/VendorCredit/BillPayment. There is deliberately no raw
 * intermediate table: QuickBooks (and later Xero/Zoho) responses are
 * converted and written straight into the single generic entity per
 * business concept.
 */
@Injectable()
export class QuickbooksMasterDataMapperService {
  private readonly logger = new Logger(QuickbooksMasterDataMapperService.name);

  constructor(
    private readonly recordsService: RecordsService,
    private readonly recordsLookup: RecordsLookupService,
  ) {}

  /** Step 0 — a singleton, not a list: `raw` is the single fetched CompanyInfo object, or `null` if the fetch returned nothing. */
  async mapCompanyInfo(
    raw: unknown,
    context: QuickbooksMapContext,
  ): Promise<void> {
    const payload = raw as QuickbooksCompanyInfoPayload | null;
    if (!payload?.Id) return;

    await this.recordsService.upsertCompanyProfile({
      organizationId: context.organizationId,
      sourceSystem: SourceSystem.QUICKBOOKS,
      sourceExternalId: String(payload.Id),
      sourceConnectionId: context.sourceConnectionId,
      companyName: payload.CompanyName ?? '',
      legalName: payload.LegalName ?? null,
      country: payload.Country ?? null,
      fiscalYearStartMonth: payload.FiscalYearStartMonth ?? null,
      baseCurrency: payload.CurrencyRef?.value ?? null,
    });

    this.logger.log(
      `Mapped company profile for connection ${context.sourceConnectionId}`,
    );
  }

  async mapVendors(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksVendorPayload[];

    for (const raw of raws) {
      await this.recordsService.upsertVendor({
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
      `Mapped ${raws.length} vendors for connection ${context.sourceConnectionId}`,
    );
  }

  /**
   * Two passes: QuickBooks doesn't guarantee a parent Account arrives before
   * its children, so every account is upserted with `parentCategoryId: null`
   * first, then re-upserted with the resolved parent once every row's
   * canonical id exists.
   */
  async mapAccounts(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksAccountPayload[];

    for (const raw of raws) {
      await this.upsertCategory(context, raw, null);
    }

    for (const raw of raws) {
      const parentExternalId = raw.ParentRef?.value;
      if (!parentExternalId) continue;

      const parentCategoryId = await this.recordsLookup.findCategoryId(
        context.organizationId,
        SourceSystem.QUICKBOOKS,
        parentExternalId,
      );
      if (!parentCategoryId) continue;

      await this.upsertCategory(context, raw, parentCategoryId);
    }

    this.logger.log(
      `Mapped ${raws.length} accounts for connection ${context.sourceConnectionId}`,
    );
  }

  async mapItems(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksItemPayload[];

    for (const raw of raws) {
      await this.recordsService.upsertItem({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: String(raw.Id),
        sourceConnectionId: context.sourceConnectionId,
        name: raw.Name,
        description: raw.Description ?? null,
        itemType: ITEM_TYPE_BY_QUICKBOOKS_TYPE[raw.Type] ?? ItemType.SERVICE,
        unitPrice: raw.UnitPrice != null ? String(raw.UnitPrice) : null,
        currency: DEFAULT_CURRENCY,
        isActive: raw.Active ?? true,
      });
    }

    this.logger.log(
      `Mapped ${raws.length} items for connection ${context.sourceConnectionId}`,
    );
  }

  async mapTaxRates(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksTaxRatePayload[];

    for (const raw of raws) {
      await this.recordsService.upsertTaxRate({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: String(raw.Id),
        sourceConnectionId: context.sourceConnectionId,
        name: raw.Name,
        ratePercent: String(raw.RateValue),
        isActive: true,
      });
    }

    this.logger.log(
      `Mapped ${raws.length} tax rates for connection ${context.sourceConnectionId}`,
    );
  }

  /**
   * Resolves both `PurchaseTaxRateList`/`SalesTaxRateList`'s first
   * `TaxRateRef` to a canonical `TaxRate.id` before persisting — `TaxRate`
   * must already be synced this poll (see `QUICKBOOKS_POLL_ENTITY_ORDER`)
   * or these resolve to `null`, same as QuickBooks' own system "TAX"/"NON"
   * codes, which carry no rate list at all.
   */
  async mapTaxCodes(
    records: unknown[],
    context: QuickbooksMapContext,
  ): Promise<void> {
    const raws = records as QuickbooksTaxCodePayload[];

    for (const raw of raws) {
      const purchaseRateExternalId =
        raw.PurchaseTaxRateList?.TaxRateDetail?.[0]?.TaxRateRef?.value;
      const salesRateExternalId =
        raw.SalesTaxRateList?.TaxRateDetail?.[0]?.TaxRateRef?.value;

      const primaryPurchaseTaxRateId = purchaseRateExternalId
        ? await this.recordsLookup.findTaxRateId(
            context.organizationId,
            SourceSystem.QUICKBOOKS,
            purchaseRateExternalId,
          )
        : null;
      const primarySalesTaxRateId = salesRateExternalId
        ? await this.recordsLookup.findTaxRateId(
            context.organizationId,
            SourceSystem.QUICKBOOKS,
            salesRateExternalId,
          )
        : null;

      await this.recordsService.upsertTaxCode({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.QUICKBOOKS,
        sourceExternalId: String(raw.Id),
        sourceConnectionId: context.sourceConnectionId,
        name: raw.Name,
        description: raw.Description ?? null,
        taxable: raw.Taxable ?? false,
        taxGroup: raw.TaxGroup ?? false,
        isActive: raw.Active ?? true,
        primaryPurchaseTaxRateId,
        primarySalesTaxRateId,
      });
    }

    this.logger.log(
      `Mapped ${raws.length} tax codes for connection ${context.sourceConnectionId}`,
    );
  }

  private upsertCategory(
    context: QuickbooksMapContext,
    raw: QuickbooksAccountPayload,
    parentCategoryId: string | null,
  ) {
    return this.recordsService.upsertSpendCategory({
      organizationId: context.organizationId,
      sourceSystem: SourceSystem.QUICKBOOKS,
      sourceExternalId: String(raw.Id),
      sourceConnectionId: context.sourceConnectionId,
      name: raw.Name,
      fullyQualifiedName: raw.FullyQualifiedName ?? null,
      categoryType: raw.AccountType ?? null,
      parentCategoryId,
      isActive: raw.Active ?? true,
    });
  }
}
