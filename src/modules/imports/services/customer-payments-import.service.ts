import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  Customer,
  CustomerPayment,
  SalesTransaction,
  SalesTransactionType,
  SourceSystem,
} from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import {
  CUSTOMER_PAYMENTS_DEFINITION,
  IMPORT_PREVIEW_ROWS,
} from '../constants';
import type {
  ImportContext,
  ImportHandler,
  ImportValidation,
  PaymentRecord,
  ReadRow,
} from '../types';
import { customerKey, customerPaymentKey, saleKey, summarize } from '../utils';
import { buildPayments } from './payment-builder';
import { ImportLookupService } from './import-lookup.service';

/**
 * Step 10 — Customer Payments file → canonical `CustomerPayment` rows,
 * applied to invoices imported in step 9 (`{ invoiceExternalId, amount }`,
 * the provider mappers' shape). Invoices are keyed by number alone, so the
 * invoice's customer is checked against the payment's.
 */
@Injectable()
export class CustomerPaymentsImportService implements ImportHandler<PaymentRecord> {
  constructor(
    private readonly lookup: ImportLookupService,
    private readonly bulk: RecordsBulkService,
  ) {}

  async validate(
    rows: ReadRow[],
    context: ImportContext,
  ): Promise<ImportValidation<PaymentRecord>> {
    const { organizationId } = context;
    const customerIds = await this.lookup.existing(
      Customer,
      organizationId,
      rows.map((r) => customerKey(String(r.values.customer ?? ''))),
    );

    const { records, issues } = await buildPayments(
      this.lookup,
      rows,
      context,
      {
        columns: CUSTOMER_PAYMENTS_DEFINITION.columns,
        partyKind: 'customer',
        partyHeader: 'Customer',
        targetColumn: 'invoiceReference',
        targetHeader: 'Invoice Number',
        keyOf: customerPaymentKey,
        // Tag the key with the customer so an invoice of a *different* customer reads as "not found for this customer".
        targetKeyOf: (customer, invoice) =>
          `${saleKey(invoice)}|${customerKey(customer)}`,
        findTargets: async (taggedKeys) => {
          const sales = await this.lookup.salesTransactions(
            organizationId,
            taggedKeys.map((k) => k.split('|')[0]),
          );
          const targets = new Map<
            string,
            { transactionType: string; totalAmount: string }
          >();
          for (const tagged of taggedKeys) {
            const [key, customer] = tagged.split('|');
            const sale = sales.get(key);
            if (sale && sale.customerId === customerIds.get(customer))
              targets.set(tagged, sale);
          }
          return targets;
        },
        payableType: SalesTransactionType.INVOICE,
        targetLabel: 'Invoice',
        targetStep: 'Sales (step 9)',
      },
    );
    // Strip the customer tag: payments store the invoice's own key.
    for (const record of records) {
      for (const application of record.applications)
        application.targetKey = application.targetKey.split('|')[0];
    }

    const keys = records.map((r) => r.key);
    const existing = await this.lookup.existing(
      CustomerPayment,
      organizationId,
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
        Customer: r.partyName,
        Invoices: r.applications.map((a) => a.targetReference).join(', '),
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
    const customers = await this.lookup.requireIds(
      manager,
      Customer,
      organizationId,
      records.map((r) => r.partyKey),
      'customers',
    );
    await this.lookup.requireIds(
      manager,
      SalesTransaction,
      organizationId,
      records.flatMap((r) => r.applications.map((a) => a.targetKey)),
      'invoices',
    );

    await this.bulk.upsertProvenanced(
      manager,
      CustomerPayment,
      records.map((r) => ({
        organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: r.key,
        sourceConnectionId: null,
        customerId: customers.get(r.partyKey) ?? null,
        paymentDate: r.date,
        totalAmount: r.total,
        currency: r.currency,
        appliedTransactions: r.applications.map((a) => ({
          invoiceExternalId: a.targetKey,
          amount: a.amount,
        })),
      })),
    );
  }
}
