/** Whitelisted sort columns for the transaction-line filter — never interpolate raw user input into ORDER BY. */
export const EXPENSE_LINE_SORTABLE_FIELDS = [
  'transactionDate',
  'amount',
  'createdAt',
] as const;
