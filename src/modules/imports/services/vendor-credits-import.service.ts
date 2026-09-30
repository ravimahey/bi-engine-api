import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { SourceSystem, Vendor, VendorCredit } from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import { VENDOR_CREDITS_DEFINITION } from '../constants';
import type {
  ImportContext,
  ImportHandler,
  ImportValidation,
  ReadRow,
  TransactionRecord,
} from '../types';
import {
  summarize,
  transactionPreview,
  transactionTotals,
  vendorCreditKey,
} from '../utils';
import { ImportLookupService } from './import-lookup.service';
import { ImportTransactionBuilderService } from './import-transaction-builder.service';

/**
 * Step 7 — Vendor Credits file → canonical `VendorCredit` rows. Lines are
 * stored denormalized on the row (as the provider mappers do), keyed by the
 * category/item they net against.
 */
@Injectable()
export class VendorCreditsImportService implements ImportHandler<TransactionRecord> {
  constructor(
    private readonly builder: ImportTransactionBuilderService,
    private readonly lookup: ImportLookupService,
    private readonly bulk: RecordsBulkService,
  ) {}

  async validate(
    rows: ReadRow[],
    context: ImportContext,
  ): Promise<ImportValidation<TransactionRecord>> {
    const { records, issues } = await this.builder.build(rows, context, {
      columns: VENDOR_CREDITS_DEFINITION.columns,
      partyKind: 'vendor',
      partyColumn: 'vendor',
      partyHeader: 'Vendor',
      groupByReferenceOnly: false,
      keyOf: vendorCreditKey,
      label: 'credit',
    });
    const keys = records.map((r) => r.key);
    const existing = await this.lookup.existing(
      VendorCredit,
      context.organizationId,
      keys,
    );
    return {
      records,
      issues,
      summary: summarize(keys, existing, transactionTotals(records)),
      preview: transactionPreview(records, existing, {
        reference: 'Credit Reference',
        party: 'Vendor',
        showType: false,
      }),
    };
  }

  async commit(
    records: TransactionRecord[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<void> {
    const { organizationId } = context;
    const vendors = await this.lookup.requireIds(
      manager,
      Vendor,
      organizationId,
      records.map((r) => r.partyKey),
      'vendors',
    );
    await this.lookup.requireLineRefs(
      manager,
      organizationId,
      records.flatMap((r) => r.lines),
    );

    await this.bulk.upsertProvenanced(
      manager,
      VendorCredit,
      records.map((r) => ({
        organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: r.key,
        sourceConnectionId: null,
        vendorId: vendors.get(r.partyKey) ?? null,
        transactionDate: r.date,
        totalAmount: r.total,
        currency: r.currency,
        // Same denormalized shape the QuickBooks/Xero mappers write.
        lines: r.lines.map((line) => ({
          accountExternalId: line.categoryKey,
          itemExternalId: line.itemKey,
          amount: line.amount,
          taxCodeRef: line.taxRateName,
        })),
      })),
    );
  }
}
