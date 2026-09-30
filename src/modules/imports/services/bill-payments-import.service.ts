import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ExpenseTransaction,
  ExpenseTransactionType,
  SourceSystem,
  TransactionPayment,
  Vendor,
} from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import { BILL_PAYMENTS_DEFINITION, IMPORT_PREVIEW_ROWS } from '../constants';
import type {
  ImportContext,
  ImportHandler,
  ImportValidation,
  PaymentRecord,
  ReadRow,
} from '../types';
import { billPaymentKey, expenseKey, summarize } from '../utils';
import { buildPayments } from './payment-builder';
import { ImportLookupService } from './import-lookup.service';

/**
 * Step 8 — Bill Payments file → canonical `TransactionPayment` rows, each
 * applied to bills imported in step 6 (`appliedTransactions` uses the same
 * `{ billExternalId, amount }` shape as the provider mappers).
 */
@Injectable()
export class BillPaymentsImportService implements ImportHandler<PaymentRecord> {
  constructor(
    private readonly lookup: ImportLookupService,
    private readonly bulk: RecordsBulkService,
  ) {}

  async validate(
    rows: ReadRow[],
    context: ImportContext,
  ): Promise<ImportValidation<PaymentRecord>> {
    const { records, issues } = await buildPayments(
      this.lookup,
      rows,
      context,
      {
        columns: BILL_PAYMENTS_DEFINITION.columns,
        partyKind: 'vendor',
        partyHeader: 'Vendor',
        targetColumn: 'billReference',
        targetHeader: 'Bill Reference',
        keyOf: billPaymentKey,
        targetKeyOf: expenseKey,
        findTargets: (keys) =>
          this.lookup.expenseTransactions(context.organizationId, keys),
        payableType: ExpenseTransactionType.BILL,
        targetLabel: 'Bill',
        targetStep: 'Expenses (step 6)',
      },
    );
    const keys = records.map((r) => r.key);
    const existing = await this.lookup.existing(
      TransactionPayment,
      context.organizationId,
      keys,
    );
    return {
      records,
      issues,
      summary: summarize(keys, existing, {
        lines: records.reduce((sum, r) => sum + r.applications.length, 0),
      }),
      preview: records.slice(0, IMPORT_PREVIEW_ROWS).map((r) => ({
        'Payment Reference': r.reference,
        'Payment Date': r.date,
        Vendor: r.partyName,
        Bills: r.applications.map((a) => a.targetReference).join(', '),
        Total: `${r.total} ${r.currency}`,
        Action: existing.has(r.key) ? 'Replace' : 'Create',
      })),
    };
  }

  async commit(
    records: PaymentRecord[],
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
    await this.lookup.requireIds(
      manager,
      ExpenseTransaction,
      organizationId,
      records.flatMap((r) => r.applications.map((a) => a.targetKey)),
      'bills',
    );

    await this.bulk.upsertProvenanced(
      manager,
      TransactionPayment,
      records.map((r) => ({
        organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: r.key,
        sourceConnectionId: null,
        vendorId: vendors.get(r.partyKey) ?? null,
        paymentDate: r.date,
        totalAmount: r.total,
        currency: r.currency,
        paymentMethod: r.paymentMethod,
        appliedTransactions: r.applications.map((a) => ({
          billExternalId: a.targetKey,
          amount: a.amount,
        })),
      })),
    );
  }
}
