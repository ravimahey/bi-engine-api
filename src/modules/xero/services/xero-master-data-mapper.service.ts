import { Injectable, Logger } from '@nestjs/common';
import { ItemType } from '@modules/records/entities';
import { RecordsService } from '@modules/records/services';
import { XERO_FALLBACK_CURRENCY } from '../constants';
import type {
  XeroAccountPayload,
  XeroContactPayload,
  XeroItemPayload,
  XeroMapContext,
  XeroOrganisationPayload,
  XeroTaxRatePayload,
} from '../types';
import { fiscalYearStartMonthName, xeroProvenance } from '../utils';

/**
 * Translates Xero master data — Organisation, Contacts, Accounts, Items,
 * TaxRates (Steps 1–5) — straight from the fetched API JSON into the
 * canonical records/* shape, the same direct-to-canonical approach as
 * `QuickbooksMasterDataMapperService` (no raw provider tables). This and
 * `XeroTransactionMapperService` are the only places that know Xero field
 * names; they share nothing with the QuickBooks mappers beyond
 * `RecordsService`.
 */
@Injectable()
export class XeroMasterDataMapperService {
  private readonly logger = new Logger(XeroMasterDataMapperService.name);

  constructor(private readonly recordsService: RecordsService) {}

  async mapOrganisation(
    payload: XeroOrganisationPayload | null,
    context: XeroMapContext,
  ): Promise<void> {
    if (!payload?.OrganisationID) return;

    await this.recordsService.upsertCompanyProfile({
      ...xeroProvenance(context, payload.OrganisationID),
      companyName: payload.Name ?? '',
      legalName: payload.LegalName ?? null,
      country: payload.CountryCode ?? null,
      fiscalYearStartMonth: fiscalYearStartMonthName(
        payload.FinancialYearEndMonth,
      ),
      baseCurrency: payload.BaseCurrency ?? null,
    });
  }

  /**
   * Xero keeps customers and suppliers in one Contacts list. Customer-only
   * contacts are skipped so they never land in the supplier-spend table.
   * Contacts flagged as neither are kept: Xero only sets `IsSupplier` once a
   * contact has a bill, so a merchant paid purely by card/bank (a SPEND bank
   * transaction) would otherwise have no Vendor to attribute that spend to.
   * Archived contacts are kept with `isActive: false`, as QuickBooks does,
   * so older bills still resolve their vendor.
   */
  async mapContacts(
    records: XeroContactPayload[],
    context: XeroMapContext,
  ): Promise<number> {
    const suppliers = records.filter(
      (contact) => contact.IsSupplier || !contact.IsCustomer,
    );

    for (const contact of suppliers) {
      const phone = contact.Phones?.find((p) => p.PhoneNumber);
      await this.recordsService.upsertVendor({
        ...xeroProvenance(context, contact.ContactID),
        displayName: contact.Name ?? '',
        isActive: (contact.ContactStatus ?? 'ACTIVE') === 'ACTIVE',
        balance:
          contact.Balances?.AccountsPayable?.Outstanding != null
            ? String(contact.Balances.AccountsPayable.Outstanding)
            : null,
        email: contact.EmailAddress || null,
        phone: phone
          ? [phone.PhoneCountryCode, phone.PhoneAreaCode, phone.PhoneNumber]
              .filter(Boolean)
              .join(' ')
              .slice(0, 50)
          : null,
      });
    }

    this.log('supplier contacts', suppliers.length, context);
    return suppliers.length;
  }

  /**
   * Every account becomes a SpendCategory, with Xero's account `Type`
   * (EXPENSE, DIRECTCOSTS, OVERHEADS, …) kept in `categoryType` — the same
   * approach QuickBooks takes with AccountType. Filtering to expense
   * classes here would leave any bill line coded to another account with
   * no category at all.
   */
  async mapAccounts(
    records: XeroAccountPayload[],
    context: XeroMapContext,
  ): Promise<number> {
    for (const account of records) {
      await this.recordsService.upsertSpendCategory({
        ...xeroProvenance(context, account.AccountID),
        name: account.Name,
        fullyQualifiedName: account.Code
          ? `${account.Code} - ${account.Name}`
          : null,
        categoryType: account.Type ?? account.Class ?? null,
        parentCategoryId: null,
        isActive: (account.Status ?? 'ACTIVE') === 'ACTIVE',
      });
    }

    this.log('accounts', records.length, context);
    return records.length;
  }

  async mapItems(
    records: XeroItemPayload[],
    context: XeroMapContext,
  ): Promise<number> {
    for (const item of records) {
      await this.recordsService.upsertItem({
        ...xeroProvenance(context, item.ItemID),
        name: item.Name || item.Code,
        description: item.PurchaseDescription || item.Description || null,
        itemType: item.IsTrackedAsInventory
          ? ItemType.INVENTORY
          : ItemType.NON_INVENTORY,
        unitPrice:
          item.PurchaseDetails?.UnitPrice != null
            ? String(item.PurchaseDetails.UnitPrice)
            : null,
        currency: context.baseCurrency ?? XERO_FALLBACK_CURRENCY,
        isActive: true,
      });
    }

    this.log('items', records.length, context);
    return records.length;
  }

  /**
   * Xero tax rates have no GUID — `TaxType` (e.g. `INPUT2`) is both their
   * identity and what each line item's `TaxType` references, so it's used as
   * the canonical `sourceExternalId`. That lets a line resolve its TaxRate
   * directly, with no TaxCode hop as QuickBooks needs.
   */
  async mapTaxRates(
    records: XeroTaxRatePayload[],
    context: XeroMapContext,
  ): Promise<number> {
    for (const rate of records) {
      await this.recordsService.upsertTaxRate({
        ...xeroProvenance(context, rate.TaxType),
        name: rate.Name,
        ratePercent: String(Number(rate.EffectiveRate ?? 0)),
        isActive: (rate.Status ?? 'ACTIVE') === 'ACTIVE',
      });
    }

    this.log('tax rates', records.length, context);
    return records.length;
  }

  private log(label: string, count: number, context: XeroMapContext): void {
    this.logger.log(
      `Mapped ${count} Xero ${label} for connection ${context.sourceConnectionId}`,
    );
  }
}
