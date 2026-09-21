/** Frontend routes the QuickBooks OAuth callback redirects to. */
export const QUICKBOOKS_CONNECTED_PATH = '/settings/integrations';
export const QUICKBOOKS_ERROR_PATH = '/settings/integrations';

/** QuickBooks Accounting API base URLs, per environment. */
export const QUICKBOOKS_PRODUCTION_BASE_URL =
  'https://quickbooks.api.intuit.com';
export const QUICKBOOKS_SANDBOX_BASE_URL =
  'https://sandbox-quickbooks.api.intuit.com';

/** `minorversion` query param sent with every QuickBooks Accounting API request. */
export const QUICKBOOKS_MINOR_VERSION = 75;

/** Upper bound on how long we wait for a QuickBooks API response before failing the call. */
export const QUICKBOOKS_REQUEST_TIMEOUT_MS = 15_000;

/**
 * QuickBooks Accounting entities this module can `SELECT * FROM` or pass to
 * the Change Data Capture endpoint — a closed list, not a free-form string,
 * so callers can't build an arbitrary query. Mirrors the API Build Order:
 * Vendor/Account/Item/TaxCode/TaxRate/Customer (master data) through
 * Bill/Purchase/VendorCredit/BillPayment (spend transactions) and
 * Invoice/SalesReceipt/Payment (revenue transactions).
 */
export const QUICKBOOKS_QUERY_ENTITIES = [
  'Vendor',
  'Account',
  'Item',
  'TaxCode',
  'TaxRate',
  'Customer',
  'Bill',
  'Purchase',
  'VendorCredit',
  'BillPayment',
  'Invoice',
  'SalesReceipt',
  'Payment',
] as const;

/** QuickBooks doesn't send an explicit currency per line/transaction in sandbox data — every mapped row defaults here. */
export const DEFAULT_CURRENCY = 'USD';

/** QuickBooks' own cap on `MAXRESULTS` for a single `/query` page. */
export const QUICKBOOKS_MAX_PAGE_SIZE = 1000;

/**
 * Transient-failure retry policy for `QuickbooksApiClientService` — applies
 * to every call (poll or interactive), not just polling. `attempt` is
 * 1-indexed; the delay backs off exponentially and is capped, except for a
 * 429 with a `Retry-After` header, which takes precedence.
 */
export const QUICKBOOKS_MAX_RETRY_ATTEMPTS = 3;
export const QUICKBOOKS_RETRY_BASE_DELAY_MS = 500;
export const QUICKBOOKS_RETRY_MAX_DELAY_MS = 8_000;

/**
 * QuickBooks entities the polling/sync mechanism (`QuickbooksPollingService`)
 * walks through, in order, one `POST /quickbooks/poll` call syncing every
 * one of these (the `entities` DTO field can narrow this, but never
 * reorder it). Fixed dependency order, per the QuickBooks API Build Order:
 * master data first (Vendor/Account/Item/TaxRate/TaxCode/Customer — TaxRate
 * before TaxCode so TaxCode can resolve its rate FKs), then spend
 * transactions (Bill/Purchase/VendorCredit/BillPayment), then revenue
 * transactions (Invoice/SalesReceipt/Payment). `CompanyInfo` (Step 0) is
 * deliberately not in this list — it's a singleton, not a list entity, and
 * always runs first, unconditionally, before this order is walked.
 */
export const QUICKBOOKS_POLL_ENTITY_ORDER = [
  'Vendor',
  'Account',
  'Item',
  'TaxRate',
  'TaxCode',
  'Customer',
  'Bill',
  'Purchase',
  'VendorCredit',
  'BillPayment',
  'Invoice',
  'SalesReceipt',
  'Payment',
] as const;

export type QuickbooksPollEntity =
  (typeof QUICKBOOKS_POLL_ENTITY_ORDER)[number];

/** Master/reference data — fetched and re-synced in full every poll, never date-filtered. */
export const QUICKBOOKS_POLL_MASTER_DATA_ENTITIES: readonly QuickbooksPollEntity[] =
  ['Vendor', 'Account', 'Item', 'TaxRate', 'TaxCode', 'Customer'];

/**
 * Every entity type ever written to `sync_cursors` for a QuickBooks
 * connection — `CompanyInfo` (Step 0, synced outside
 * `QUICKBOOKS_POLL_ENTITY_ORDER`) plus the full poll order.
 * `GET /quickbooks/sync-status` reports one row per entry here, even for
 * entities this connection has never synced yet.
 */
export const QUICKBOOKS_SYNC_STATUS_ENTITIES: readonly (
  QuickbooksPollEntity | 'CompanyInfo'
)[] = ['CompanyInfo', ...QUICKBOOKS_POLL_ENTITY_ORDER];

/** Width of one in-memory date chunk. Change here to move the default to day/week — no other code needs to change. */
export type QuickbooksDateChunkUnit = 'day' | 'week' | 'month';
export const QUICKBOOKS_POLL_CHUNK_UNIT: QuickbooksDateChunkUnit = 'month';
