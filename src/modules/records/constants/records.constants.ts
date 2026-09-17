/** Whitelisted sort columns for the transaction-line filter — never interpolate raw user input into ORDER BY. */
export const EXPENSE_LINE_SORTABLE_FIELDS = [
  'transactionDate',
  'amount',
  'createdAt',
] as const;

/** Whitelisted sort columns for the master/reference-data list endpoints below. */
export const VENDOR_SORTABLE_FIELDS = [
  'displayName',
  'balance',
  'createdAt',
] as const;

export const CUSTOMER_SORTABLE_FIELDS = [
  'displayName',
  'balance',
  'createdAt',
] as const;

export const SPEND_CATEGORY_SORTABLE_FIELDS = ['name', 'createdAt'] as const;

export const ITEM_SORTABLE_FIELDS = ['name', 'unitPrice', 'createdAt'] as const;

export const TAX_RATE_SORTABLE_FIELDS = [
  'name',
  'ratePercent',
  'createdAt',
] as const;

export const TAX_CODE_SORTABLE_FIELDS = ['name', 'createdAt'] as const;

/** Whitelisted sort columns for the transaction header/list endpoints below. */
export const EXPENSE_TRANSACTION_SORTABLE_FIELDS = [
  'transactionDate',
  'dueDate',
  'totalAmount',
  'createdAt',
] as const;

export const VENDOR_CREDIT_SORTABLE_FIELDS = [
  'transactionDate',
  'totalAmount',
  'createdAt',
] as const;

export const TRANSACTION_PAYMENT_SORTABLE_FIELDS = [
  'paymentDate',
  'totalAmount',
  'createdAt',
] as const;

export const SALES_TRANSACTION_SORTABLE_FIELDS = [
  'transactionDate',
  'dueDate',
  'totalAmount',
  'createdAt',
] as const;

/** Mirrors `EXPENSE_LINE_SORTABLE_FIELDS` for `sales_transaction_lines`. */
export const SALES_LINE_SORTABLE_FIELDS = [
  'transactionDate',
  'amount',
  'createdAt',
] as const;

export const CUSTOMER_PAYMENT_SORTABLE_FIELDS = [
  'paymentDate',
  'totalAmount',
  'createdAt',
] as const;
