import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import {
  Customer,
  ExpenseTransaction,
  Item,
  SalesTransaction,
  SourceSystem,
  SpendCategory,
  TaxRate,
  Vendor,
} from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import type { ImportIssue, LineRecord } from '../types';
import {
  categoryKey,
  customerKey,
  itemKey,
  taxRateKey,
  vendorKey,
} from '../utils';

/** Kinds of named reference a row can make, with where the user imports each. */
export const REFERENCE_KINDS = {
  vendor: {
    entity: Vendor,
    keyOf: vendorKey,
    label: 'Vendor',
    step: 'Vendors (step 1)',
  },
  customer: {
    entity: Customer,
    keyOf: customerKey,
    label: 'Customer',
    step: 'Customers (step 2)',
  },
  category: {
    entity: SpendCategory,
    keyOf: categoryKey,
    label: 'Category',
    step: 'Categories (step 3)',
  },
  item: { entity: Item, keyOf: itemKey, label: 'Item', step: 'Items (step 4)' },
  taxRate: {
    entity: TaxRate,
    keyOf: taxRateKey,
    label: 'Tax Rate',
    step: 'Tax Rates (step 5)',
  },
} as const;

export type ReferenceKind = keyof typeof REFERENCE_KINDS;

export interface NamedReference {
  name: string;
  row: number;
  column: string;
}

/**
 * Resolves names in an import file to existing CSV-imported canonical
 * records. Lookups are batched (one query per kind, not per row) and only
 * see `SourceSystem.CSV` rows, so a CSV expense can never attach to a
 * vendor synced from QuickBooks/Xero.
 */
@Injectable()
export class ImportLookupService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bulk: RecordsBulkService,
  ) {}

  /** Existing canonical ids for `keys` — sourceExternalId → id. */
  existing<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    organizationId: string,
    keys: string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<string, string>> {
    return this.bulk.findIdsByExternalIds(
      manager,
      entity,
      organizationId,
      SourceSystem.CSV,
      keys,
    );
  }

  /**
   * Checks every named reference exists; each missing one becomes an error
   * on its row telling the user which import to run first. Returns the
   * key → id map for the ones found.
   */
  async resolveNames(
    kind: ReferenceKind,
    organizationId: string,
    references: NamedReference[],
    issues: ImportIssue[],
  ): Promise<Map<string, string>> {
    const { entity, keyOf, label, step } = REFERENCE_KINDS[kind];
    const found = await this.existing(
      entity,
      organizationId,
      references.map((r) => keyOf(r.name)),
    );

    for (const reference of references) {
      if (found.has(keyOf(reference.name))) continue;
      issues.push({
        severity: 'error',
        row: reference.row,
        column: reference.column,
        value: reference.name,
        message: `${label} "${reference.name}" was not found. Import it in ${step} first, or check the spelling.`,
      });
    }
    return found;
  }

  /**
   * Inside the commit transaction: key → id for every key, or a 409 if any
   * disappeared since validation (e.g. deleted, or the org was reset).
   */
  async requireIds<T extends ObjectLiteral>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    organizationId: string,
    keys: string[],
    label: string,
  ): Promise<Map<string, string>> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return new Map();
    const ids = await this.existing(entity, organizationId, unique, manager);
    const missing = unique.length - ids.size;
    if (missing > 0) {
      throw new ConflictException(
        `${missing} ${label} used in this file no longer exist. Upload the file again to re-validate it.`,
      );
    }
    return ids;
  }

  /** Inside the commit transaction: canonical ids for every category/item/tax rate the lines use. */
  async requireLineRefs(
    manager: EntityManager,
    organizationId: string,
    lines: LineRecord[],
  ) {
    const keys = (pick: (line: LineRecord) => string | null) =>
      lines.map(pick).filter((key): key is string => key !== null);
    return {
      categories: await this.requireIds(
        manager,
        SpendCategory,
        organizationId,
        keys((l) => l.categoryKey),
        'categories',
      ),
      items: await this.requireIds(
        manager,
        Item,
        organizationId,
        keys((l) => l.itemKey),
        'items',
      ),
      taxRates: await this.requireIds(
        manager,
        TaxRate,
        organizationId,
        keys((l) => l.taxRateKey),
        'tax rates',
      ),
    };
  }

  /** Tax rate key → rate %, for calculating tax on lines. */
  async taxRatePercents(
    organizationId: string,
    keys: string[],
  ): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map();
    const rows = await this.dataSource.getRepository(TaxRate).find({
      where: {
        organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: In([...new Set(keys)]),
      },
      select: { sourceExternalId: true, ratePercent: true },
    });
    return new Map(rows.map((row) => [row.sourceExternalId, row.ratePercent]));
  }

  /** Imported bills/purchases by key, for validating bill payments. */
  async expenseTransactions(organizationId: string, keys: string[]) {
    if (keys.length === 0) return new Map<string, ExpenseTransaction>();
    const rows = await this.dataSource.getRepository(ExpenseTransaction).find({
      where: {
        organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: In([...new Set(keys)]),
      },
      select: {
        id: true,
        sourceExternalId: true,
        transactionType: true,
        totalAmount: true,
      },
    });
    return new Map(rows.map((row) => [row.sourceExternalId, row]));
  }

  /** Imported invoices/receipts by key, for validating customer payments. */
  async salesTransactions(organizationId: string, keys: string[]) {
    if (keys.length === 0) return new Map<string, SalesTransaction>();
    const rows = await this.dataSource.getRepository(SalesTransaction).find({
      where: {
        organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: In([...new Set(keys)]),
      },
      select: {
        id: true,
        sourceExternalId: true,
        transactionType: true,
        totalAmount: true,
        customerId: true,
      },
    });
    return new Map(rows.map((row) => [row.sourceExternalId, row]));
  }

  /** Every CSV category's key → parent key, for detecting parent loops that span earlier imports. */
  async categoryParents(
    organizationId: string,
  ): Promise<Map<string, string | null>> {
    const rows = await this.dataSource.getRepository(SpendCategory).find({
      where: { organizationId, sourceSystem: SourceSystem.CSV },
      select: { id: true, sourceExternalId: true, parentCategoryId: true },
    });
    const keyById = new Map(rows.map((row) => [row.id, row.sourceExternalId]));
    return new Map(
      rows.map((row) => [
        row.sourceExternalId,
        row.parentCategoryId
          ? (keyById.get(row.parentCategoryId) ?? null)
          : null,
      ]),
    );
  }
}
