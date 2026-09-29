/** Frontend routes the Xero OAuth callback redirects to — same settings page as QuickBooks. */
export const XERO_CONNECTED_PATH = '/settings/integrations';
export const XERO_ERROR_PATH = '/settings/integrations';

/** Xero identity (OAuth 2.0) endpoints. Xero has no separate sandbox host — develop against the Demo Company. */
export const XERO_AUTHORIZE_URL =
  'https://login.xero.com/identity/connect/authorize';
export const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
export const XERO_REVOCATION_URL =
  'https://identity.xero.com/connect/revocation';

/** Lists the tenants (organisations) an access token is authorized for — Step 0 tenant resolution. */
export const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

/** Accounting API base — every call also needs the `Xero-tenant-id` header. */
export const XERO_ACCOUNTING_BASE_URL = 'https://api.xero.com/api.xro/2.0';

/**
 * Read-only scopes for the spend-side phase. `offline_access` is mandatory:
 * without it Xero issues no refresh token and the connection dies after 30
 * minutes. These are Xero's *granular* scopes — apps created from 2026 get
 * `invalid_scope` for the old broad `accounting.transactions.read` (checked
 * against this app's client id), so transactions are split three ways:
 * invoices (Invoices, CreditNotes, Items), payments, bank transactions.
 * Settings covers Organisation, Accounts and TaxRates. Add write scopes only
 * when a feature needs to write back to Xero.
 */
export const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'accounting.contacts.read',
  'accounting.settings.read',
  'accounting.invoices.read',
  'accounting.payments.read',
  'accounting.banktransactions.read',
] as const;

/**
 * Xero's refresh token lifetime: 60 days from issue, and every refresh
 * rotates it. The token response doesn't report this, so it's recorded here.
 */
export const XERO_REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/** Refresh a little ahead of the real 30-minute access-token expiry so a request never races it. */
export const XERO_REFRESH_SKEW_MS = 60_000;

/** Upper bound on how long we wait for a Xero API response before failing the call. */
export const XERO_REQUEST_TIMEOUT_MS = 20_000;

/** Xero's own cap on `pageSize` for paged endpoints — the default of 100 would cost 10x the calls. */
export const XERO_MAX_PAGE_SIZE = 1000;

/** Transient-failure retry policy for `XeroApiClientService` — same shape as QuickBooks'. */
export const XERO_MAX_RETRY_ATTEMPTS = 3;
export const XERO_RETRY_BASE_DELAY_MS = 500;
export const XERO_RETRY_MAX_DELAY_MS = 8_000;

/**
 * Rate-limit guard rails, read off `X-MinLimit-Remaining`/`X-DayLimit-Remaining`
 * after every call. Xero's limits are per tenant (60 calls/minute, 5000/day),
 * so pausing before the minute limit trips protects that tenant's other
 * calls, and refusing to continue near the daily limit keeps one big sync
 * from locking a client out for the rest of the day.
 */
export const XERO_MIN_LIMIT_THRESHOLD = 3;
export const XERO_MIN_LIMIT_PAUSE_MS = 60_000;
export const XERO_DAY_LIMIT_THRESHOLD = 50;

/**
 * Xero entities the polling service walks, in fixed dependency order (the
 * Xero API Build Order, Steps 2–9): master data first so every transaction
 * line can resolve its Vendor/SpendCategory/Item/TaxRate, then spend
 * transactions. `Organisation` (Step 1) is deliberately not in this list —
 * it's a singleton that always runs first, before this order is walked.
 */
export const XERO_POLL_ENTITY_ORDER = [
  'Contacts',
  'Accounts',
  'Items',
  'TaxRates',
  'Invoices',
  'BankTransactions',
  'CreditNotes',
  'Payments',
] as const;

export type XeroPollEntity = (typeof XERO_POLL_ENTITY_ORDER)[number];

/**
 * Entities pulled incrementally with If-Modified-Since once they have a
 * cursor (Step 10). Accounts, Items and TaxRates are small and always pulled
 * whole: the code → GUID index that bill lines resolve through has to be
 * complete, not just the rows that changed.
 */
export const XERO_INCREMENTAL_ENTITIES: readonly XeroPollEntity[] = [
  'Contacts',
  'Invoices',
  'BankTransactions',
  'CreditNotes',
  'Payments',
];

/**
 * How far before the stored cursor an incremental pull starts. Upserts are
 * idempotent, so re-reading a few minutes of changes costs nothing, and it
 * covers clock skew and records saved while the previous pull was running.
 */
export const XERO_INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;

/** Endpoints that accept `page`/`pageSize`. The others return everything in one response. */
export const XERO_PAGED_ENTITIES: readonly XeroPollEntity[] = [
  'Contacts',
  'Invoices',
  'BankTransactions',
  'CreditNotes',
  'Payments',
];

/**
 * Server-side `where` filter per entity, so Xero only returns spend-side
 * rows. The mappers re-check the same conditions anyway, since
 * webhook-triggered and If-Modified-Since pulls share this path.
 */
export const XERO_ENTITY_WHERE: Partial<Record<XeroPollEntity, string>> = {
  Invoices: 'Type=="ACCPAY"',
  BankTransactions: 'Type=="SPEND"',
  CreditNotes: 'Type=="ACCPAYCREDIT"',
  Payments: 'PaymentType=="ACCPAYPAYMENT"',
};

/** Transactional entities whose `where` filter can take a `Date>=` lower bound from the poll's `fromDate`. */
export const XERO_DATED_ENTITIES: readonly XeroPollEntity[] = [
  'Invoices',
  'BankTransactions',
  'CreditNotes',
  'Payments',
];

/**
 * Every entity type ever written to `sync_cursors` for a Xero connection —
 * `Organisation` plus the full poll order. `GET /xero/sync-status` reports
 * one row per entry, even for entities never synced yet.
 */
export const XERO_SYNC_STATUS_ENTITIES: readonly (
  XeroPollEntity | 'Organisation'
)[] = ['Organisation', ...XERO_POLL_ENTITY_ORDER];

/**
 * Webhook `eventCategory` → the entity to re-pull. Xero's webhook payload
 * only says "something changed", never the data itself, so the handler just
 * triggers an incremental pull of this entity.
 */
export const XERO_WEBHOOK_CATEGORY_ENTITY: Record<string, XeroPollEntity> = {
  CONTACT: 'Contacts',
  INVOICE: 'Invoices',
  CREDITNOTE: 'CreditNotes',
};

/** Fallback when neither the transaction nor the organisation reports a currency. */
export const XERO_FALLBACK_CURRENCY = 'USD';

/** Statuses that make a bill/credit note/bank transaction real spend. Anything else (DRAFT, SUBMITTED, VOIDED, DELETED) is removed from the canonical layer. */
export const XERO_LIVE_INVOICE_STATUSES: readonly string[] = [
  'AUTHORISED',
  'PAID',
];
export const XERO_LIVE_BANK_TRANSACTION_STATUSES: readonly string[] = [
  'AUTHORISED',
];
export const XERO_LIVE_PAYMENT_STATUSES: readonly string[] = ['AUTHORISED'];
