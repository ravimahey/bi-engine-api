import { ItemType } from '@modules/records/entities';
import { ImportType } from '@modules/imports/entities';
import type { ImportDefinition } from '@modules/imports/types';
import { ACTIVE_COLUMN, CURRENCY_COLUMN, nameColumn } from './shared-columns';

export const CATEGORIES_DEFINITION: ImportDefinition = {
  type: ImportType.CATEGORIES,
  step: 3,
  title: 'Categories',
  description:
    'Your chart of accounts — the buckets spend (and income) is grouped into on the dashboard.',
  dependsOn: [],
  columns: [
    nameColumn(
      'Category Name',
      ['Category', 'Account', 'Account Name', 'Name'],
      'Unique category name.',
    ),
    {
      key: 'categoryType',
      header: 'Type',
      aliases: ['Category Type', 'Account Type'],
      type: 'text',
      required: false,
      maxLength: 100,
      description: 'Optional, e.g. Expense, Cost of Goods Sold, Income.',
    },
    {
      key: 'parent',
      header: 'Parent Category',
      aliases: ['Parent', 'Parent Account'],
      type: 'text',
      required: false,
      maxLength: 255,
      description:
        'Optional. Name of another category in this file or already imported.',
    },
    ACTIVE_COLUMN,
  ],
  exampleRows: [
    ['Operating Expenses', 'Expense', '', 'Yes'],
    ['Office Supplies', 'Expense', 'Operating Expenses', 'Yes'],
    ['Shipping', 'Cost of Goods Sold', '', 'Yes'],
    ['Sales Revenue', 'Income', '', 'Yes'],
  ],
  notes: [
    'Each category name must appear only once in the file.',
    'A parent can be listed before or after its children in the same file.',
    'A category cannot be its own parent, and parents cannot form a loop.',
  ],
};

export const ITEMS_DEFINITION: ImportDefinition = {
  type: ImportType.ITEMS,
  step: 4,
  title: 'Items',
  description:
    'Specific products or services you buy or sell. Optional, but makes price-increase findings precise.',
  dependsOn: [],
  columns: [
    nameColumn(
      'Item Name',
      ['Item', 'Product', 'Product Name', 'Service', 'Name'],
      'Unique item name.',
    ),
    {
      key: 'itemType',
      header: 'Type',
      aliases: ['Item Type'],
      type: 'enum',
      required: false,
      enumValues: {
        service: ItemType.SERVICE,
        inventory: ItemType.INVENTORY,
        'non-inventory': ItemType.NON_INVENTORY,
        'non inventory': ItemType.NON_INVENTORY,
        noninventory: ItemType.NON_INVENTORY,
        non_inventory: ItemType.NON_INVENTORY,
      },
      description:
        'Service, Inventory or Non-inventory. Leave blank for Service.',
    },
    {
      key: 'description',
      header: 'Description',
      type: 'text',
      required: false,
      maxLength: 2000,
      description: 'Optional.',
    },
    {
      key: 'unitPrice',
      header: 'Unit Price',
      aliases: ['Price', 'Rate', 'Cost'],
      type: 'decimal',
      required: false,
      description:
        'Optional usual price, excluding tax. The baseline for price-increase checks.',
    },
    CURRENCY_COLUMN,
    ACTIVE_COLUMN,
  ],
  exampleRows: [
    [
      'Printer Paper (A4 box)',
      'Non-inventory',
      'Box of 5 reams',
      '25.00',
      '',
      'Yes',
    ],
    [
      'Freight Delivery',
      'Service',
      'Standard pallet delivery',
      '120.00',
      '',
      'Yes',
    ],
    [
      'Consulting Hour',
      'Service',
      'Advisory work, billed hourly',
      '150.00',
      '',
      'Yes',
    ],
  ],
  notes: ['Each item name must appear only once in the file.'],
};

export const TAX_RATES_DEFINITION: ImportDefinition = {
  type: ImportType.TAX_RATES,
  step: 5,
  title: 'Tax Rates',
  description:
    'The tax rates on your transactions, kept separate so a tax change is never mistaken for a price increase.',
  dependsOn: [],
  columns: [
    nameColumn(
      'Tax Rate Name',
      ['Tax Rate', 'Tax Name', 'Tax Code', 'Name'],
      'Unique tax rate name, e.g. "GST 10%".',
    ),
    {
      key: 'ratePercent',
      header: 'Rate %',
      aliases: ['Rate', 'Rate Percent', 'Percentage', 'Tax Rate %'],
      type: 'percent',
      required: true,
      description: 'Between 0 and 100. Enter 10 (or 10%) for ten percent.',
    },
    ACTIVE_COLUMN,
  ],
  exampleRows: [
    ['GST 10%', '10', 'Yes'],
    ['No Tax', '0', 'Yes'],
  ],
  notes: ['Each tax rate name must appear only once in the file.'],
};
