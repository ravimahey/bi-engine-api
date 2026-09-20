import {
  CompanyProfile,
  Customer,
  CustomerPayment,
  ExpenseTransaction,
  ExpenseTransactionLine,
  Item,
  SalesTransaction,
  SalesTransactionLine,
  SpendCategory,
  TaxCode,
  TaxRate,
  TransactionPayment,
  Vendor,
  VendorCredit,
} from '@modules/records/entities';

/**
 * Every tenant-scoped record type an admin can browse for a user, keyed by
 * the URL segment of `GET /admin/users/:id/records/:type`.
 */
export const ADMIN_RECORD_ENTITIES = {
  vendors: Vendor,
  categories: SpendCategory,
  items: Item,
  'tax-rates': TaxRate,
  'tax-codes': TaxCode,
  customers: Customer,
  'company-profile': CompanyProfile,
  'expense-transactions': ExpenseTransaction,
  'expense-transaction-lines': ExpenseTransactionLine,
  'vendor-credits': VendorCredit,
  'transaction-payments': TransactionPayment,
  'sales-transactions': SalesTransaction,
  'sales-transaction-lines': SalesTransactionLine,
  'customer-payments': CustomerPayment,
} as const;

export type AdminRecordType = keyof typeof ADMIN_RECORD_ENTITIES;

export const ADMIN_RECORD_TYPES = Object.keys(
  ADMIN_RECORD_ENTITIES,
) as AdminRecordType[];
