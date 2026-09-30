import type { ColumnSpec } from '@modules/imports/types';

export const ACTIVE_COLUMN: ColumnSpec = {
  key: 'active',
  header: 'Active',
  aliases: ['Is Active', 'Status'],
  type: 'boolean',
  required: false,
  description: 'Yes or No. Leave blank for Yes.',
};

export const CURRENCY_COLUMN: ColumnSpec = {
  key: 'currency',
  header: 'Currency',
  aliases: ['Currency Code'],
  type: 'currency',
  required: false,
  groupLevel: true,
  description:
    "3-letter code such as USD, AUD, GBP. Leave blank to use your organization's base currency.",
};

export const nameColumn = (
  header: string,
  aliases: string[],
  description: string,
): ColumnSpec => ({
  key: 'name',
  header,
  aliases,
  type: 'text',
  required: true,
  maxLength: 255,
  description,
});

export const dateColumn = (
  key: string,
  header: string,
  required: boolean,
  description: string,
  aliases: string[] = [],
): ColumnSpec => ({
  key,
  header,
  aliases,
  type: 'date',
  required,
  groupLevel: true,
  description: `${description} Use YYYY-MM-DD (e.g. 2026-01-31) or an Excel date cell.`,
});

export const referenceColumn = (
  key: string,
  header: string,
  aliases: string[],
  description: string,
): ColumnSpec => ({
  key,
  header,
  aliases,
  type: 'text',
  required: true,
  maxLength: 80,
  description,
});

/** Line-level columns shared by expenses, vendor credits and sales. */
export const lineColumns = (categoryHint: string): ColumnSpec[] => [
  {
    key: 'category',
    header: 'Category',
    aliases: ['Account', 'Category Name', 'Expense Category'],
    type: 'text',
    required: false,
    maxLength: 255,
    description: `${categoryHint} Must match a name in your Categories import.`,
  },
  {
    key: 'item',
    header: 'Item',
    aliases: ['Item Name', 'Product', 'Service'],
    type: 'text',
    required: false,
    maxLength: 255,
    description: 'Optional. Must match a name in your Items import.',
  },
  {
    key: 'description',
    header: 'Description',
    aliases: ['Line Description', 'Memo'],
    type: 'text',
    required: false,
    maxLength: 2000,
    description: 'Optional free text for this line.',
  },
  {
    key: 'quantity',
    header: 'Quantity',
    aliases: ['Qty'],
    type: 'decimal',
    required: false,
    description: 'Optional. Up to 4 decimal places.',
  },
  {
    key: 'unitPrice',
    header: 'Unit Price',
    aliases: ['Rate', 'Price'],
    type: 'decimal',
    required: false,
    description: 'Optional, excluding tax. Up to 4 decimal places.',
  },
  {
    key: 'amount',
    header: 'Amount',
    aliases: ['Line Amount', 'Net Amount', 'Amount Excl Tax'],
    type: 'money',
    required: false,
    allowNegative: true,
    description:
      'Line amount excluding tax, up to 2 decimal places. Required unless both Quantity and Unit Price are filled, in which case it is calculated.',
  },
  {
    key: 'taxRate',
    header: 'Tax Rate',
    aliases: ['Tax', 'Tax Code', 'Tax Name'],
    type: 'text',
    required: false,
    maxLength: 255,
    description: 'Optional. Must match a name in your Tax Rates import.',
  },
  {
    key: 'taxAmount',
    header: 'Tax Amount',
    aliases: ['Tax Total', 'GST', 'VAT'],
    type: 'money',
    required: false,
    allowNegative: true,
    description:
      'Optional. If blank and a Tax Rate is given, it is calculated from the rate.',
  },
];
