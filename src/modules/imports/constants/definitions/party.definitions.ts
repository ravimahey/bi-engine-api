import { ImportType } from '@modules/imports/entities';
import type { ColumnSpec, ImportDefinition } from '@modules/imports/types';
import { ACTIVE_COLUMN, nameColumn } from './shared-columns';

const contactColumns = (party: string): ColumnSpec[] => [
  {
    key: 'email',
    header: 'Email',
    aliases: ['Email Address', 'E-mail'],
    type: 'email',
    required: false,
    maxLength: 255,
    description: `Optional ${party} email address.`,
  },
  {
    key: 'phone',
    header: 'Phone',
    aliases: ['Phone Number', 'Telephone', 'Mobile'],
    type: 'text',
    required: false,
    maxLength: 50,
    description: `Optional ${party} phone number, as text.`,
  },
  ACTIVE_COLUMN,
];

export const VENDORS_DEFINITION: ImportDefinition = {
  type: ImportType.VENDORS,
  step: 1,
  title: 'Vendors',
  description:
    'The suppliers you buy from. Expenses, vendor credits and bill payments refer to them by name.',
  dependsOn: [],
  columns: [
    nameColumn(
      'Vendor Name',
      ['Vendor', 'Supplier', 'Supplier Name', 'Name'],
      'Unique vendor name. Used to match expenses to this vendor.',
    ),
    ...contactColumns('vendor'),
  ],
  exampleRows: [
    ['Acme Office Supplies', 'accounts@acme.example', '+61 2 5550 1234', 'Yes'],
    ['Northwind Logistics', 'billing@northwind.example', '', 'Yes'],
  ],
  notes: [
    'Each vendor name must appear only once in the file.',
    'Names are matched ignoring upper/lower case and extra spaces, so "ACME office supplies" is the same vendor.',
    'Re-importing a vendor with the same name updates it instead of creating a duplicate.',
  ],
};

export const CUSTOMERS_DEFINITION: ImportDefinition = {
  type: ImportType.CUSTOMERS,
  step: 2,
  title: 'Customers',
  description:
    'The customers you sell to. Sales and customer payments refer to them by name.',
  dependsOn: [],
  columns: [
    nameColumn(
      'Customer Name',
      ['Customer', 'Client', 'Client Name', 'Name'],
      'Unique customer name. Used to match sales to this customer.',
    ),
    ...contactColumns('customer'),
  ],
  exampleRows: [
    ['Globex Corporation', 'ap@globex.example', '+61 3 5550 9876', 'Yes'],
    ['Initech Ltd', '', '', 'Yes'],
  ],
  notes: [
    'Each customer name must appear only once in the file.',
    'Re-importing a customer with the same name updates it instead of creating a duplicate.',
  ],
};
