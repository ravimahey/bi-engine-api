import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  Customer,
  SalesTransaction,
  SalesTransactionLine,
  SalesTransactionType,
  SourceSystem,
} from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import { SALES_DEFINITION } from '../constants';
import type {
  ImportContext,
  ImportHandler,
  ImportValidation,
  ReadRow,
  TransactionRecord,
} from '../types';
import {
  saleKey,
  summarize,
  transactionPreview,
  transactionTotals,
} from '../utils';
import { ImportLookupService } from './import-lookup.service';
import { ImportTransactionBuilderService } from './import-transaction-builder.service';

/**
 * Step 9 — Sales file → canonical `SalesTransaction` (invoice / sales
 * receipt) headers plus `SalesTransactionLine`s, which feed Revenue vs
 * Spend. Keyed by Invoice Number alone — your own invoice numbers are
 * unique — so rows of one invoice naming two customers are an error.
 */
@Injectable()
export class SalesImportService implements ImportHandler<TransactionRecord> {
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
      columns: SALES_DEFINITION.columns,
      partyKind: 'customer',
      partyColumn: 'customer',
      partyHeader: 'Customer',
      groupByReferenceOnly: true,
      keyOf: (_customer, reference) => saleKey(reference),
      label: 'sale',
      dueDateType: SalesTransactionType.INVOICE,
    });
    const keys = records.map((r) => r.key);
    const existing = await this.lookup.existing(
      SalesTransaction,
      context.organizationId,
      keys,
    );
    return {
      records,
      issues,
      summary: summarize(keys, existing, transactionTotals(records)),
      preview: transactionPreview(records, existing, {
        reference: 'Invoice Number',
        party: 'Customer',
        showType: true,
      }),
    };
  }

  async commit(
    records: TransactionRecord[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<void> {
    const { organizationId } = context;
    const customers = await this.lookup.requireIds(
      manager,
      Customer,
      organizationId,
      records.map((r) => r.partyKey),
      'customers',
    );
    const refs = await this.lookup.requireLineRefs(
      manager,
      organizationId,
      records.flatMap((r) => r.lines),
    );

    const ids = await this.bulk.upsertProvenanced(
      manager,
      SalesTransaction,
      records.map((r) => ({
        organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: r.key,
        sourceConnectionId: null,
        transactionType: r.type as SalesTransactionType,
        customerId: customers.get(r.partyKey) ?? null,
        transactionDate: r.date,
        dueDate: r.dueDate,
        totalAmount: r.total,
        currency: r.currency,
        balance: null,
        privateNote: [r.reference, r.notes].filter(Boolean).join(' — '),
      })),
    );

    await this.bulk.replaceLines(
      manager,
      SalesTransactionLine,
      [...ids.values()],
      records.flatMap((r) =>
        r.lines.map((line) => ({
          transactionId: ids.get(r.key) as string,
          externalLineId: `line-${line.lineNumber}`,
          organizationId,
          customerId: customers.get(r.partyKey) ?? null,
          transactionDate: r.date,
          categoryId: line.categoryKey
            ? (refs.categories.get(line.categoryKey) ?? null)
            : null,
          itemId: line.itemKey ? (refs.items.get(line.itemKey) ?? null) : null,
          taxRateId: line.taxRateKey
            ? (refs.taxRates.get(line.taxRateKey) ?? null)
            : null,
          taxCodeExternalRef: null,
          description: line.description,
          lineNumber: line.lineNumber,
          amount: line.amount,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          currency: r.currency,
        })),
      ),
    );
  }
}
