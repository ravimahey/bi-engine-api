import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
  ExpenseTransactionType,
  SourceSystem,
  Vendor,
} from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import { EXPENSES_DEFINITION } from '../constants';
import type {
  ImportContext,
  ImportHandler,
  ImportValidation,
  ReadRow,
  TransactionRecord,
} from '../types';
import {
  expenseKey,
  summarize,
  transactionPreview,
  transactionTotals,
} from '../utils';
import { ImportLookupService } from './import-lookup.service';
import { ImportTransactionBuilderService } from './import-transaction-builder.service';

/**
 * Step 6 — Expenses file → canonical `ExpenseTransaction` (bill/purchase)
 * headers plus `ExpenseTransactionLine`s, the grain every spend chart and
 * finding reads. Identity is Vendor + Reference, so re-importing replaces
 * a transaction and all its lines rather than duplicating it.
 */
@Injectable()
export class ExpensesImportService implements ImportHandler<TransactionRecord> {
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
      columns: EXPENSES_DEFINITION.columns,
      partyKind: 'vendor',
      partyColumn: 'vendor',
      partyHeader: 'Vendor',
      groupByReferenceOnly: false,
      keyOf: expenseKey,
      label: 'transaction',
      dueDateType: ExpenseTransactionType.BILL,
    });
    const keys = records.map((r) => r.key);
    const existing = await this.lookup.existing(
      ExpenseTransaction,
      context.organizationId,
      keys,
    );
    return {
      records,
      issues,
      summary: summarize(keys, existing, transactionTotals(records)),
      preview: transactionPreview(records, existing, {
        reference: 'Reference',
        party: 'Vendor',
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
    const vendors = await this.lookup.requireIds(
      manager,
      Vendor,
      organizationId,
      records.map((r) => r.partyKey),
      'vendors',
    );
    const refs = await this.lookup.requireLineRefs(
      manager,
      organizationId,
      records.flatMap((r) => r.lines),
    );

    const ids = await this.bulk.upsertProvenanced(
      manager,
      ExpenseTransaction,
      records.map((r) => ({
        organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: r.key,
        sourceConnectionId: null,
        transactionType: r.type as ExpenseTransactionType,
        vendorId: vendors.get(r.partyKey) ?? null,
        transactionDate: r.date,
        dueDate: r.dueDate,
        totalAmount: r.total,
        currency: r.currency,
        balance: null,
        paymentMethod: r.paymentMethod,
        privateNote: [r.reference, r.notes].filter(Boolean).join(' — '),
      })),
    );

    await this.bulk.replaceLines(
      manager,
      ExpenseTransactionLine,
      [...ids.values()],
      records.flatMap((r) =>
        r.lines.map((line) => ({
          transactionId: ids.get(r.key) as string,
          externalLineId: `line-${line.lineNumber}`,
          organizationId,
          vendorId: vendors.get(r.partyKey) ?? null,
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
