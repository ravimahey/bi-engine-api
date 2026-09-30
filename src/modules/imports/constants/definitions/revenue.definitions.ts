import { SalesTransactionType } from '@modules/records/entities';
import { ImportType } from '@modules/imports/entities';
import type { ColumnSpec, ImportDefinition } from '@modules/imports/types';
import {
  CURRENCY_COLUMN,
  dateColumn,
  lineColumns,
  referenceColumn,
} from './shared-columns';

const customerColumn: ColumnSpec = {
  key: 'customer',
  header: 'Customer',
  aliases: ['Customer Name', 'Client', 'Client Name'],
  type: 'text',
  required: true,
  maxLength: 255,
  description: 'Must match a name in your Customers import.',
};

export const SALES_DEFINITION: ImportDefinition = {
  type: ImportType.SALES,
  step: 9,
  title: 'Sales',
  description:
    'Invoices you sent and sales paid on the spot. Powers the Revenue vs Spend view.',
  dependsOn: [
    ImportType.CUSTOMERS,
    ImportType.CATEGORIES,
    ImportType.ITEMS,
    ImportType.TAX_RATES,
  ],
  columns: [
    referenceColumn(
      'reference',
      'Invoice Number',
      ['Reference', 'Invoice No', 'Receipt Number', 'Sale Number', 'Ref'],
      'Your invoice or receipt number. Rows sharing an Invoice Number are one sale.',
    ),
    {
      key: 'type',
      header: 'Type',
      aliases: ['Transaction Type'],
      type: 'enum',
      required: true,
      groupLevel: true,
      enumValues: {
        invoice: SalesTransactionType.INVOICE,
        'sales receipt': SalesTransactionType.SALES_RECEIPT,
        receipt: SalesTransactionType.SALES_RECEIPT,
        'cash sale': SalesTransactionType.SALES_RECEIPT,
      },
      description:
        'Invoice (to be paid later) or Sales Receipt (paid on the spot).',
    },
    dateColumn('date', 'Date', true, 'Sale date.', [
      'Invoice Date',
      'Transaction Date',
    ]),
    dateColumn(
      'dueDate',
      'Due Date',
      false,
      'Optional, invoices only. Must not be before Date.',
    ),
    { ...customerColumn, groupLevel: true },
    ...lineColumns('Optional income category, e.g. "Sales Revenue".'),
    CURRENCY_COLUMN,
    {
      key: 'notes',
      header: 'Notes',
      aliases: ['Private Note', 'Note'],
      type: 'text',
      required: false,
      groupLevel: true,
      maxLength: 2000,
      description: 'Optional note for the whole sale.',
    },
  ],
  exampleRows: [
    [
      'INV-0001',
      'Invoice',
      '2026-01-08',
      '2026-02-07',
      'Globex Corporation',
      'Sales Revenue',
      'Consulting Hour',
      'January advisory',
      '10',
      '150.00',
      '1500.00',
      'GST 10%',
      '150.00',
      '',
      '',
    ],
    [
      'SR-0001',
      'Sales Receipt',
      '2026-01-15',
      '',
      'Initech Ltd',
      'Sales Revenue',
      '',
      'Half-day workshop',
      '1',
      '800.00',
      '800.00',
      'No Tax',
      '0.00',
      '',
      '',
    ],
  ],
  notes: [
    'One row per line item. Rows sharing an Invoice Number form one sale — an invoice number can belong to only one customer.',
    'Sale-level columns (Type, Date, Due Date, Customer, Currency, Notes) may be filled on the first row only; if repeated, they must match.',
    'The sale total is the sum of Amount + Tax Amount across its rows, and must be greater than zero.',
  ],
};

export const CUSTOMER_PAYMENTS_DEFINITION: ImportDefinition = {
  type: ImportType.CUSTOMER_PAYMENTS,
  step: 10,
  title: 'Customer Payments',
  description: 'Money received against your invoices.',
  dependsOn: [ImportType.CUSTOMERS, ImportType.SALES],
  columns: [
    referenceColumn(
      'reference',
      'Payment Reference',
      ['Payment Number', 'Receipt Number', 'Reference'],
      'Your receipt or remittance number. Rows sharing Customer + Payment Reference are one payment.',
    ),
    dateColumn('date', 'Payment Date', true, 'Date the money was received.', [
      'Date',
      'Received Date',
    ]),
    customerColumn,
    referenceColumn(
      'invoiceReference',
      'Invoice Number',
      ['Invoice', 'Invoice No', 'Invoice Reference'],
      'Invoice being paid — must match an imported sale of Type Invoice for the same customer.',
    ),
    {
      key: 'amount',
      header: 'Amount Received',
      aliases: ['Amount', 'Payment Amount', 'Amount Paid'],
      type: 'money',
      required: true,
      description: 'Amount applied to that invoice, greater than zero.',
    },
    CURRENCY_COLUMN,
  ],
  exampleRows: [
    ['RCV-4001', '2026-01-30', 'Globex Corporation', 'INV-0001', '1650.00', ''],
  ],
  notes: [
    'One row per invoice paid. A single payment covering several invoices uses one row per invoice, repeating the Payment Reference.',
    'Payment Date and Currency may be filled on the first row only; if repeated, they must match.',
  ],
};
