import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CompanyProfile,
  ExpenseTransaction,
  ExpenseTransactionLine,
  Item,
  SpendCategory,
  TaxCode,
  TaxRate,
  TransactionPayment,
  Vendor,
  VendorCredit,
} from '../entities';
import type {
  UpsertCompanyProfileInput,
  UpsertExpenseTransactionInput,
  UpsertItemInput,
  UpsertSpendCategoryInput,
  UpsertTaxCodeInput,
  UpsertTaxRateInput,
  UpsertTransactionPaymentInput,
  UpsertVendorCreditInput,
  UpsertVendorInput,
} from '../types';

/**
 * Owns every write to the spend-side and master-data canonical records/*
 * tables (CompanyProfile, Vendor, SpendCategory, Item, TaxRate, TaxCode,
 * ExpenseTransaction+Lines, VendorCredit, TransactionPayment). A provider
 * mapper (`QuickbooksMasterDataMapperService`/`QuickbooksTransactionMapperService`
 * today, a future Xero/Zoho equivalent later) is the only caller — this
 * service knows nothing about any provider's API shape, only the
 * (organization, sourceSystem, sourceExternalId) identity every upsert is
 * matched on. `RecordsRevenueService` is the sibling covering the revenue
 * side (Customer/SalesTransaction/CustomerPayment) — split out purely to
 * keep each file within this repo's size guidance. `ExpenseTransaction` has
 * no direct repository here — every write to it goes through
 * `dataSource.transaction()` below so the header and its lines save
 * atomically.
 */
@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(CompanyProfile)
    private readonly companyProfiles: Repository<CompanyProfile>,
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
    @InjectRepository(VendorCredit)
    private readonly vendorCredits: Repository<VendorCredit>,
    @InjectRepository(TransactionPayment)
    private readonly payments: Repository<TransactionPayment>,
    private readonly dataSource: DataSource,
  ) {}

  async upsertCompanyProfile(
    input: UpsertCompanyProfileInput,
  ): Promise<CompanyProfile> {
    const existing = await this.companyProfiles.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const profile = existing
      ? Object.assign(existing, input)
      : this.companyProfiles.create(input);

    return this.companyProfiles.save(profile);
  }

  async upsertVendor(input: UpsertVendorInput): Promise<Vendor> {
    const existing = await this.vendors.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const vendor = existing
      ? Object.assign(existing, input)
      : this.vendors.create(input);

    return this.vendors.save(vendor);
  }

  async upsertSpendCategory(
    input: UpsertSpendCategoryInput,
  ): Promise<SpendCategory> {
    const existing = await this.categories.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const category = existing
      ? Object.assign(existing, input)
      : this.categories.create(input);

    return this.categories.save(category);
  }

  async upsertItem(input: UpsertItemInput): Promise<Item> {
    const existing = await this.items.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const item = existing
      ? Object.assign(existing, input)
      : this.items.create(input);

    return this.items.save(item);
  }

  async upsertTaxRate(input: UpsertTaxRateInput): Promise<TaxRate> {
    const existing = await this.taxRates.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const taxRate = existing
      ? Object.assign(existing, input)
      : this.taxRates.create(input);

    return this.taxRates.save(taxRate);
  }

  async upsertTaxCode(input: UpsertTaxCodeInput): Promise<TaxCode> {
    const existing = await this.taxCodes.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const taxCode = existing
      ? Object.assign(existing, input)
      : this.taxCodes.create(input);

    return this.taxCodes.save(taxCode);
  }

  /**
   * Upserts an `ExpenseTransaction` header and fully replaces its lines in
   * one transaction. QuickBooks always sends a Bill/Purchase's complete line
   * set on read, so "replace all lines" is simpler and safer than diffing
   * individual lines — a line removed at the source becomes a line removed
   * here, never an orphan.
   */
  async upsertExpenseTransaction(
    input: UpsertExpenseTransactionInput,
  ): Promise<ExpenseTransaction> {
    const { lines, ...header } = input;

    return this.dataSource.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(ExpenseTransaction);
      const lineRepo = manager.getRepository(ExpenseTransactionLine);

      const existing = await transactionRepo.findOne({
        where: {
          organizationId: header.organizationId,
          sourceSystem: header.sourceSystem,
          sourceExternalId: header.sourceExternalId,
        },
      });

      const transaction = existing
        ? Object.assign(existing, header)
        : transactionRepo.create(header);
      const saved = await transactionRepo.save(transaction);

      await lineRepo.delete({ transactionId: saved.id });
      if (lines.length > 0) {
        await lineRepo.insert(
          lines.map((line) => ({
            ...line,
            transactionId: saved.id,
            organizationId: saved.organizationId,
            vendorId: saved.vendorId,
            transactionDate: saved.transactionDate,
          })),
        );
      }

      return saved;
    });
  }

  async upsertVendorCredit(
    input: UpsertVendorCreditInput,
  ): Promise<VendorCredit> {
    const existing = await this.vendorCredits.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const credit = existing
      ? Object.assign(existing, input)
      : this.vendorCredits.create(input);

    return this.vendorCredits.save(credit);
  }

  async upsertTransactionPayment(
    input: UpsertTransactionPaymentInput,
  ): Promise<TransactionPayment> {
    const existing = await this.payments.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const payment = existing
      ? Object.assign(existing, input)
      : this.payments.create(input);

    return this.payments.save(payment);
  }
}
