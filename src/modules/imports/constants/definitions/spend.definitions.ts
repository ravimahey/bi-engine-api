import { ExpenseTransactionType } from '@modules/records/entities';
import { ImportType } from '@modules/imports/entities';
import type { ColumnSpec, ImportDefinition } from '@modules/imports/types';
import {
  CURRENCY_COLUMN,
  dateColumn,
  lineColumns,
  referenceColumn,
} from './shared-columns';

const vendorColumn: ColumnSpec = {
  key: 'vendor',
  header: 'Vendor',
  aliases: ['Vendor Name', 'Supplier', 'Supplier Name'],
  type: 'text',
  required: true,
  maxLength: 255,
  description: 'Must match a name in your Vendors import.',
};

const paymentMethodColumn: ColumnSpec = {
  key: 'paymentMethod',
  header: 'Payment Method',
  aliases: ['Paid With', 'Method'],
  type: 'text',
  required: false,
  groupLevel: true,
  maxLength: 50,
  description: 'Optional, e.g. Credit Card, Bank Transfer, Cash.',
};

const GROUPING_NOTE =
  'One row per line item. Rows with the same Vendor and Reference form one transaction — put each line on its own row and repeat the Reference.';
const HEADER_NOTE =
  'Transaction-level columns (Type, Date, Due Date, Currency, Payment Method, Notes) may be filled on the first row only; if repeated, they must match.';
const TOTAL_NOTE =
  'The transaction total is calculated as the sum of Amount + Tax Amount across its rows, and must be greater than zero.';

export const EXPENSES_DEFINITION: ImportDefinition = {
  type: ImportType.EXPENSES,
  step: 6,
  title: 'Expenses',
  description:
    'Your bills from suppliers and direct purchases (card, cash, bank). This is the main spend data every finding is built on.',
  dependsOn: [
    ImportType.VENDORS,
    ImportType.CATEGORIES,
    ImportType.ITEMS,
    ImportType.TAX_RATES,
  ],
  columns: [
    referenceColumn(
      'reference',
      'Reference',
      ['Bill Number', 'Bill No', 'Receipt Number', 'Invoice Number', 'Ref'],
      'Your bill or receipt number. Rows sharing Vendor + Reference are one transaction.',
    ),
    {
      key: 'type',
      header: 'Type',
      aliases: ['Transaction Type'],
      type: 'enum',
      required: true,
      groupLevel: true,
      enumValues: {
        bill: ExpenseTransactionType.BILL,
        purchase: ExpenseTransactionType.PURCHASE,
        expense: ExpenseTransactionType.PURCHASE,
        'card purchase': ExpenseTransactionType.PURCHASE,
        'cash purchase': ExpenseTransactionType.PURCHASE,
      },
      description:
        'Bill (to be paid later) or Purchase (already paid by card, cash or bank).',
    },
    dateColumn('date', 'Date', true, 'Transaction date.', [
      'Transaction Date',
      'Bill Date',
    ]),
    dateColumn(
      'dueDate',
      'Due Date',
      false,
      'Optional, bills only. Must not be before Date.',
    ),
    vendorColumn,
    ...lineColumns(
      'Optional, but uncategorized spend shows as "Uncategorized" on the dashboard.',
    ),
    CURRENCY_COLUMN,
    paymentMethodColumn,
    {
      key: 'notes',
      header: 'Notes',
      aliases: ['Private Note', 'Note'],
      type: 'text',
      required: false,
      groupLevel: true,
      maxLength: 2000,
      description: 'Optional note for the whole transaction.',
    },
  ],
  exampleRows: [
    [
      'BILL-1001',
      'Bill',
      '2026-01-05',
      '2026-02-04',
      'Acme Office Supplies',
      'Office Supplies',
      'Printer Paper (A4 box)',
      'A4 paper',
      '4',
      '25.00',
      '100.00',
      'GST 10%',
      '10.00',
      '',
      '',
      'January stationery order',
    ],
    [
      'BILL-1001',
      '',
      '',
      '',
      'Acme Office Supplies',
      'Office Supplies',
      '',
      'Pens',
      '10',
      '2.50',
      '25.00',
      'GST 10%',
      '2.50',
      '',
      '',
      '',
    ],
    [
      'RCPT-2001',
      'Purchase',
      '2026-01-12',
      '',
      'Northwind Logistics',
      'Shipping',
      'Freight Delivery',
      'Pallet to Sydney',
      '1',
      '120.00',
      '120.00',
      'No Tax',
      '0.00',
      '',
      'Credit Card',
      '',
    ],
  ],
  notes: [
    GROUPING_NOTE,
    HEADER_NOTE,
    TOTAL_NOTE,
    'Re-importing the same Vendor + Reference replaces that transaction and all its lines.',
  ],
};

export const VENDOR_CREDITS_DEFINITION: ImportDefinition = {
  type: ImportType.VENDOR_CREDITS,
  step: 7,
  title: 'Vendor Credits',
  description:
    'Refunds and credit notes from suppliers, so a corrected overcharge nets out instead of looking like extra spend.',
  dependsOn: [
    ImportType.VENDORS,
    ImportType.CATEGORIES,
    ImportType.ITEMS,
    ImportType.TAX_RATES,
  ],
  columns: [
    referenceColumn(
      'reference',
      'Credit Reference',
      ['Reference', 'Credit Note Number', 'Credit Number', 'Ref'],
      'The credit note number. Rows sharing Vendor + Credit Reference are one credit.',
    ),
    dateColumn('date', 'Date', true, 'Credit date.', ['Credit Date']),
    vendorColumn,
    ...lineColumns('Optional — the category the original spend was in.'),
    CURRENCY_COLUMN,
  ],
  exampleRows: [
    [
      'CR-501',
      '2026-01-20',
      'Acme Office Supplies',
      'Office Supplies',
      'Printer Paper (A4 box)',
      'Damaged box refund',
      '1',
      '25.00',
      '25.00',
      'GST 10%',
      '2.50',
      '',
    ],
  ],
  notes: [
    GROUPING_NOTE.replace('Reference', 'Credit Reference'),
    'Enter credit amounts as positive numbers.',
    TOTAL_NOTE.replace('transaction', 'credit'),
  ],
};

export const BILL_PAYMENTS_DEFINITION: ImportDefinition = {
  type: ImportType.BILL_PAYMENTS,
  step: 8,
  title: 'Bill Payments',
  description:
    'When you actually paid your bills — used for payment timing and cash-flow views.',
  dependsOn: [ImportType.VENDORS, ImportType.EXPENSES],
  columns: [
    referenceColumn(
      'reference',
      'Payment Reference',
      ['Payment Number', 'Payment Ref', 'Reference'],
      'Your payment or remittance number. Rows sharing Vendor + Payment Reference are one payment.',
    ),
    dateColumn('date', 'Payment Date', true, 'Date the payment was made.', [
      'Date',
      'Paid Date',
    ]),
    vendorColumn,
    referenceColumn(
      'billReference',
      'Bill Reference',
      ['Bill Number', 'Bill No', 'Bill'],
      'Reference of the bill being paid — must match an imported expense of Type Bill for the same vendor.',
    ),
    {
      key: 'amount',
      header: 'Amount Paid',
      aliases: ['Amount', 'Payment Amount'],
      type: 'money',
      required: true,
      description: 'Amount applied to that bill, greater than zero.',
    },
    paymentMethodColumn,
    CURRENCY_COLUMN,
  ],
  exampleRows: [
    [
      'PAY-3001',
      '2026-01-25',
      'Acme Office Supplies',
      'BILL-1001',
      '137.50',
      'Bank Transfer',
      '',
    ],
  ],
  notes: [
    'One row per bill paid. A single payment covering several bills uses one row per bill, repeating the Payment Reference.',
    'Payment Date, Payment Method and Currency may be filled on the first row only; if repeated, they must match.',
  ],
};
