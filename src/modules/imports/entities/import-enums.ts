/**
 * The ten kinds of file a user can import, one template each. The order
 * users must follow lives in `IMPORT_DEFINITIONS` (constants), not here.
 */
export enum ImportType {
  VENDORS = 'vendors',
  CUSTOMERS = 'customers',
  CATEGORIES = 'categories',
  ITEMS = 'items',
  TAX_RATES = 'tax_rates',
  EXPENSES = 'expenses',
  VENDOR_CREDITS = 'vendor_credits',
  BILL_PAYMENTS = 'bill_payments',
  SALES = 'sales',
  CUSTOMER_PAYMENTS = 'customer_payments',
}

/**
 * `validated` — parsed with zero errors, payload stored, waiting for the
 * user to confirm. `failed` — had errors; nothing can be committed.
 * `committed` — written to the canonical tables. `discarded` — the user
 * cancelled a validated import.
 */
export enum ImportStatus {
  VALIDATED = 'validated',
  FAILED = 'failed',
  COMMITTED = 'committed',
  DISCARDED = 'discarded',
}
