# APIs to Build — Exposing Synced QuickBooks Data to the Frontend

Scope: only what's needed for the frontend to read/display the data that
`POST /quickbooks/poll` already syncs into the canonical `records/*` schema.
Nothing here depends on findings, actions, onboarding, CSV upload, or AI —
that's out of scope for this doc.

## Current state

- The sync pipeline (`quickbooks.module.ts` → `records.module.ts`) is done
  and writes into 14 canonical entities.
- The only read endpoint that exists today is:
  `GET /records/expense-transaction-lines` — filterable line-level spend
  data (vendor/category/item/date/amount).
- Everything else below has **no controller endpoint yet** — the data is
  sitting in Postgres with nothing serving it to the frontend.

All endpoints follow the existing pattern in `RecordsController`:
`@CurrentUser()` + `organizationId` query/path param, non-admins restricted
to their own organization (`assertOwnOrganization`), paginated via
`PaginationQueryDto` where the result is a list.

---

## 1. Master / reference data

Read-only lookups — mostly used to populate dropdowns/filters elsewhere,
but also worth their own list screens.

| Method & Path | Entity | Notes |
|---|---|---|
| `GET /records/vendors` | `Vendor` | List, filter by `search`/`isActive`, paginated |
| `GET /records/vendors/:id` | `Vendor` | Single vendor detail |
| `GET /records/categories` | `SpendCategory` | List, `parentCategoryId`-aware (return as tree or flat with `parentCategoryId` for the FE to nest) |
| `GET /records/items` | `Item` | List, filter by `search`/`isActive` |
| `GET /records/tax-rates` | `TaxRate` | List |
| `GET /records/tax-codes` | `TaxCode` | List — include resolved `primaryPurchaseTaxRateId`/`primarySalesTaxRateId` |
| `GET /records/customers` | `Customer` | List, filter by `search`/`isActive` |
| `GET /records/customers/:id` | `Customer` | Single customer detail |
| `GET /records/company-profile` | `CompanyProfile` | Singleton per org — company name, legal name, country, fiscal year start, base currency |

## 2. Spend side

| Method & Path | Entity | Notes |
|---|---|---|
| `GET /records/expense-transactions` | `ExpenseTransaction` | Header-level list (Bill + Purchase, unified via `transactionType`) — filter by vendor/date/type/status, paginated |
| `GET /records/expense-transactions/:id` | `ExpenseTransaction` + lines | Detail view: header + its `ExpenseTransactionLine[]` |
| `GET /records/expense-transaction-lines` | `ExpenseTransactionLine` | **Already exists** — line-grain filter by vendor/category/item/date/amount |
| `GET /records/vendor-credits` | `VendorCredit` | List, filter by vendor/date |
| `GET /records/transaction-payments` | `TransactionPayment` | List — bill payments, filter by vendor/date |

## 3. Revenue side

Mirrors the spend side exactly.

| Method & Path | Entity | Notes |
|---|---|---|
| `GET /records/sales-transactions` | `SalesTransaction` | Header-level list (Invoice + SalesReceipt, unified via `transactionType`) — filter by customer/date/type |
| `GET /records/sales-transactions/:id` | `SalesTransaction` + lines | Detail view: header + its `SalesTransactionLine[]` |
| `GET /records/sales-transaction-lines` | `SalesTransactionLine` | Line-grain filter, mirrors `expense-transaction-lines` |
| `GET /records/customer-payments` | `CustomerPayment` | List, filter by customer/date |

## 4. Sync status (so the FE knows how fresh the data is)

`SyncCursor` already tracks `lastSyncedAt` per `(providerConnectionId, entityType)`
— nothing displays it yet.

| Method & Path | Notes |
|---|---|
| `GET /quickbooks/sync-status` | `?organizationId=` → last-synced timestamp + cursor per entity (Vendor, Bill, Invoice, …), so the FE can show "Vendors — synced 4 minutes ago" / flag anything stale |

---

## Build order suggestion

1. **Master data reads** (vendors, categories, items, tax rates/codes, customers, company profile) — small, no joins, unblocks every other screen that needs a name/dropdown instead of a raw UUID.
2. **Expense transaction header + detail** — the highest-value screen (spend list/detail), reuses `RecordsLookupService` patterns already in place.
3. **Sales transaction header + detail + lines** — same shape as #2, revenue side.
4. **Vendor credits / transaction payments / customer payments** — smaller supporting lists.
5. **Sync status** — cheap, high value for showing data freshness in the UI.

## Implementation notes

- New services go in `records/services/` — likely a `RecordsQueryService` (or split further if it grows past ~250 lines) alongside the existing `RecordsFilterService`/`RecordsLookupService`/`RecordsService`/`RecordsRevenueService`.
- New DTOs go in `records/dto/`, reusing `PaginationQueryDto` and following `ExpenseTransactionFilterQueryDto`'s pattern for comma-separated UUID filters.
- Sync status likely lives on `QuickbooksController` (it wraps `SyncCursorsService`, already injected in `QuickbooksPollingService`) rather than `RecordsController`, since it's provider-specific info, not canonical data.
