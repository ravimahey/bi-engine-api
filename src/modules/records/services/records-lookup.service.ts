import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Customer,
  Item,
  SpendCategory,
  TaxCode,
  TaxRate,
  Vendor,
} from '../entities';
import type { SourceSystem } from '../entities';

/**
 * Resolves a provider's external id to the canonical row's uuid — what a
 * mapper needs to turn a QuickBooks `VendorRef`/`AccountRef`/`ItemRef`/
 * `CustomerRef` into `ExpenseTransactionLine.vendorId`/`categoryId`/`itemId`/
 * `SalesTransaction.customerId`, etc. Split out from `RecordsService`/
 * `RecordsRevenueService` (which own writes) so each stays a single,
 * focused responsibility.
 */
@Injectable()
export class RecordsLookupService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
    @InjectRepository(SpendCategory)
    private readonly categories: Repository<SpendCategory>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    @InjectRepository(TaxRate)
    private readonly taxRates: Repository<TaxRate>,
    @InjectRepository(TaxCode)
    private readonly taxCodes: Repository<TaxCode>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async findVendorId(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<string | null> {
    const vendor = await this.vendors.findOne({
      where: { organizationId, sourceSystem, sourceExternalId },
      select: { id: true },
    });
    return vendor?.id ?? null;
  }

  async findCategoryId(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<string | null> {
    const category = await this.categories.findOne({
      where: { organizationId, sourceSystem, sourceExternalId },
      select: { id: true },
    });
    return category?.id ?? null;
  }

  async findItemId(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<string | null> {
    const item = await this.items.findOne({
      where: { organizationId, sourceSystem, sourceExternalId },
      select: { id: true },
    });
    return item?.id ?? null;
  }

  async findTaxRateId(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<string | null> {
    const taxRate = await this.taxRates.findOne({
      where: { organizationId, sourceSystem, sourceExternalId },
      select: { id: true },
    });
    return taxRate?.id ?? null;
  }

  async findCustomerId(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<string | null> {
    const customer = await this.customers.findOne({
      where: { organizationId, sourceSystem, sourceExternalId },
      select: { id: true },
    });
    return customer?.id ?? null;
  }

  /**
   * Resolves a spend-side line's `TaxCodeRef` to the canonical `TaxRate` id
   * already stored on the matching `TaxCode` row's `primaryPurchaseTaxRateId`
   * — the mapper resolved that FK once at TaxCode sync time, so this is a
   * single lookup, not a two-hop external-id chase.
   */
  async findPurchaseTaxRateIdForTaxCode(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<string | null> {
    const taxCode = await this.taxCodes.findOne({
      where: { organizationId, sourceSystem, sourceExternalId },
      select: { primaryPurchaseTaxRateId: true },
    });
    return taxCode?.primaryPurchaseTaxRateId ?? null;
  }

  /** Same as `findPurchaseTaxRateIdForTaxCode`, for revenue-side lines. */
  async findSalesTaxRateIdForTaxCode(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<string | null> {
    const taxCode = await this.taxCodes.findOne({
      where: { organizationId, sourceSystem, sourceExternalId },
      select: { primarySalesTaxRateId: true },
    });
    return taxCode?.primarySalesTaxRateId ?? null;
  }
}
