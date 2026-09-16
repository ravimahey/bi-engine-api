# Spend-Analytics Schema Guide

Why every entity in the spend-analytics domain exists, what role it plays,
and how data flows from a QuickBooks API response to a number on the
dashboard. Read this before adding a new entity, a new provider (Xero,
Zoho), or a new finding that queries this data — it's the map for a schema
that spans four modules and 21 tables.

**Audience:** any backend engineer touching `modules/organizations`,
`modules/providers`, `modules/quickbooks`, or `modules/records`.

---

## Contents

1. [The one-paragraph mental model](#1-the-one-paragraph-mental-model)
2. [Why four modules, not one](#2-why-four-modules-not-one)
3. [`modules/organizations` — the tenant](#3-modulesorganizations--the-tenant)
4. [`modules/providers` — shared connection tracking](#4-modulesproviders--shared-connection-tracking)
5. [`modules/quickbooks` — the raw layer](#5-modulesquickbooks--the-raw-layer)
6. [`modules/records` — the canonical layer](#6-modulesrecords--the-canonical-layer)
7. [The mapper: raw → canonical](#7-the-mapper-raw--canonical)
8. [Design decisions worth knowing](#8-design-decisions-worth-knowing)
9. [Quick-reference table: every entity](#9-quick-reference-table-every-entity)
10. [What's deliberately not built yet](#10-whats-deliberately-not-built-yet)

---

## 1. The one-paragraph mental model

Every business (an `Organization`) connects one or more accounting providers
(a `ProviderConnection` — QuickBooks today, Xero/Zoho later). Each provider
module owns a **raw layer**: tables that mirror that provider's API shape
almost exactly (`QuickbooksVendor`, `QuickbooksBill`, ...), so a sync never
has to guess at meaning — it just stores what the API said. A **mapper**
then translates those raw rows into a **canonical layer**
(`Vendor`, `ExpenseTransaction`, ...) that knows nothing about QuickBooks,
Xero, or any other provider — only generic spend concepts. Everything the
app actually queries — the dashboard, the findings engine, "Ask Ordaraa" —
reads the canonical layer only. This is what makes "add Xero" a new sibling
module plus a new mapper, not a rewrite of the dashboard.

## 2. Why four modules, not one

| Module | Knows about | Depended on by |
|---|---|---|
| `organizations` | Nothing — just the tenant row | everyone |
| `providers` | Nothing provider-specific — just "a connection exists" | `quickbooks`, `records` |
| `quickbooks` | QuickBooks' own field names and API quirks | nobody (a leaf module) |
| `records` | Nothing about any provider — only the canonical shape | nobody (a leaf module) |

The dependency arrows only ever point from a provider module *into*
`providers`/`records`/`organizations`, never the other way, and never from
`records` into `quickbooks`. That one rule is what keeps a future
`modules/xero` a parallel, independent addition instead of a fork of
`modules/quickbooks`: it FKs to the same `provider_connections` table,
writes into the same canonical tables, and never needs to know QuickBooks
exists.

```
organizations
     ▲
     │ organization_id
     │
providers  ◄───────────────┐
     ▲                     │
     │ provider_connection_id     │ source_connection_id
     │                     │
quickbooks (raw)     records (canonical)
     │                     ▲
     └────── mapper ───────┘
        (translates raw → canonical)
```

## 3. `modules/organizations` — the tenant

**Why it exists:** every table below needs `organization_id` for tenant
isolation (PROJECT_CONTEXT.md: "tenant-isolated per business"), but no
organization/tenant table existed anywhere in the codebase before this
schema. This module was added specifically to give that FK something real
to point at — it is not part of the original QuickBooks integration work,
it's structural plumbing the rest of the schema requires.

| Entity | Table | Role |
|---|---|---|
| `Organization` | `organizations` | The tenant. `name` + a unique `slug`. Deliberately minimal — no controller yet, since organization sign-up/management is a separate, later feature. Every other table's `organization_id` FKs here. |

## 4. `modules/providers` — shared connection tracking

**Why it exists:** the app will eventually talk to more than one accounting
provider. Rather than each provider module (QuickBooks, later Xero, Zoho)
tracking its own "am I connected, what are my tokens" table, that concept is
factored out once, here. A provider module only ever needs to know its own
`provider_connections.id` — never anything about how another provider
connects.

| Entity | Table | Role |
|---|---|---|
| `ProviderConnection` | `provider_connections` | One row per `(organization, provider)`. Holds `provider` (quickbooks/xero/zoho), the external realm/company id, `status`, and the OAuth `accessToken`/`refreshToken` — encrypted at rest with AES-256-GCM (`common/utils/token-encryption.util.ts`, keyed by `TOKEN_ENCRYPTION_KEY`) on top of the usual `select: false` + `@Exclude()` guard. This is the row every `Quickbooks*` raw row and every canonical record's `source_connection_id` points back to. |
| `SyncCursor` | `sync_cursors` | Per-connection, per-entity-type incremental-sync checkpoint (`entityType` + an opaque `cursor` string). For QuickBooks, `entityType` is a CDC entity name ("Bill", "Vendor", ...) and `cursor` is the `changedSince` ISO timestamp from the build-order guide's Step 9 — kept provider-agnostic so a future provider with a different cursor style (e.g. an opaque page token) reuses the same table. |

> **Note:** the pre-existing `QuickbooksConnection` entity/table
> (`modules/quickbooks/entities`) was left untouched — it still powers the
> working OAuth flow you already tested against the sandbox. It does not
> yet write into `provider_connections`; wiring that up is listed under
> [§10](#10-whats-deliberately-not-built-yet).

## 5. `modules/quickbooks` — the raw layer

**Why a "raw" layer at all:** the build-order guide's own advice —
"keep a `raw_response` JSON column... schema surprises are common" — plus
"store `SyncToken` even though you're only reading" and "store `Id` fields
as strings." Every `Quickbooks*` entity below extends `QuickbooksRawEntity`,
which carries exactly those shared columns:

| Column | Why |
|---|---|
| `providerConnectionId` | FK to `provider_connections` — which business/connection this row came from. |
| `externalId` | QuickBooks' own `Id`, always a string (Intuit doesn't guarantee it stays numeric). |
| `syncToken` | QuickBooks' optimistic-concurrency token — unused for now (read-only), kept for whenever this module writes back. |
| `rawPayload` | The full original API response, as `jsonb`. The safety net for an unmapped field mattering later. |
| `syncedAt` | When this row was last pulled. |

A unique index on `(providerConnectionId, externalId)` is what makes a sync
idempotent — pulling the same vendor twice updates one row, not two — and
that same index (via its leftmost prefix) answers "every row synced through
this connection" without a second index.

| Entity | Table | Mirrors (build-order step) | Role |
|---|---|---|---|
| `QuickbooksVendor` | `quickbooks_vendors` | Vendor (Step 1) | Supplier master data — `displayName`, `active`, `balance`, contact info. Everything else eventually points back to one of these via `VendorRef`. |
| `QuickbooksAccount` | `quickbooks_accounts` | Account (Step 2) | Chart-of-accounts category buckets. Carries `parentExternalId` for the sub-account hierarchy (e.g. "Utilities:Gas and Electric"), resolved by the mapper, not a hard FK here. |
| `QuickbooksItem` | `quickbooks_items` | Item (Step 3) | The specific product/service on a line ("flour", not just "Materials"). `type` (Inventory/NonInventory/Service) drives how the mapper interprets `unitPrice`. |
| `QuickbooksTaxRate` | `quickbooks_tax_rates` | TaxRate (Step 4) | The actual percentage, kept separate from transaction amounts so a rate change is never mistaken for a price increase. |
| `QuickbooksBill` | `quickbooks_bills` | Bill (Step 5) | The core AP expense header — vendor, dates, total, AP account. **The single most important entity** per the guide; its lines are the real leak signal. |
| `QuickbooksBillLine` | `quickbooks_bill_lines` | Bill.Line[] | One row per Bill line, carrying `amount`/`qty`/`unitPrice` at line grain — what lets a finding tell "they bought more" apart from "the price went up." `detailType` records whether it's item-based (has qty/price) or account-based (category only). |
| `QuickbooksPurchase` | `quickbooks_purchases` | Purchase (Step 6) | Card/cash spend that never goes through the Bill/AP workflow. Skipping this would under-count real spend. |
| `QuickbooksPurchaseLine` | `quickbooks_purchase_lines` | Purchase.Line[] | Same reasoning as `QuickbooksBillLine`, for Purchases. |
| `QuickbooksVendorCredit` | `quickbooks_vendor_credits` | VendorCredit (Step 7) | Nets a supplier refund against the spend it originally hit. No child line table (see [§8](#8-design-decisions-worth-knowing)) — line detail lives in a `lines` jsonb column instead. |
| `QuickbooksBillPayment` | `quickbooks_bill_payments` | BillPayment (Step 8) | When a bill was *actually paid*, not just recorded — the "Reported vs Observed value" gap. `linkedBills` (jsonb) captures which bill(s) a payment settles, since one payment can pay several bills. |

The two-pass CDC sync loop itself (Step 9 of the guide) isn't built yet —
see [§10](#10-whats-deliberately-not-built-yet).

## 6. `modules/records` — the canonical layer

**Why a canonical layer at all:** this is the entire point of the two-layer
split. Nothing here mentions QuickBooks. The dashboard, the findings engine,
and "Ask Ordaraa" query these tables and these tables only — so adding Xero
later means writing a new mapper, not touching a single query anywhere else
in the app.

Every header-level entity extends `ProvenancedRecordEntity`, which bundles
two things every canonical row needs:

- **Tenant isolation** (from `TenantScopedEntity`): `organizationId`.
- **Provenance**: `sourceSystem` (quickbooks/xero/zoho/**manual**/**csv** —
  a superset of `ProviderType` since manual/CSV entry has no OAuth
  connection at all), `sourceExternalId` (the raw entity's `externalId`,
  carried forward), and `sourceConnectionId` (FK to `provider_connections`
  — never to a `Quickbooks*` table, keeping this module provider-agnostic).

  These three columns together are unique per organization — that's the
  identity the mapper upserts on, matching "this QuickBooks Bill #46" back
  to the same canonical row every sync, instead of creating duplicates.

| Entity | Table | Role |
|---|---|---|
| `Vendor` | `vendors` | Canonical supplier. Mirrors `QuickbooksVendor`; will mirror Xero's Contact the same way. |
| `SpendCategory` | `spend_categories` | Canonical category bucket — mirrors *any* QuickBooks Account classification (not filtered to Expense/COGS in the schema; that filtering is a query-time job for the findings engine). Self-referential `parentCategoryId` preserves the sub-account hierarchy. |
| `Item` | `items` | Canonical product/service — what turns "Materials spend went up" into "flour spend went up." |
| `TaxRate` | `tax_rates` | Canonical tax percentage, kept off transaction amounts for the same reason as the raw layer. |
| `ExpenseTransaction` | `expense_transactions` | **Unifies Bill and Purchase** behind one `transactionType` enum — the findings engine queries one table instead of branching per provider concept. Header only: vendor, dates, total, balance, payment method. |
| `ExpenseTransactionLine` | `expense_transaction_lines` | **The actual money-leak signal.** `amount`/`quantity`/`unitPrice` plus FKs to `Vendor`/`SpendCategory`/`Item`/`TaxRate`. This is the only table with `organizationId`/`vendorId`/`transactionDate` *denormalized* from its parent — see [§8](#8-design-decisions-worth-knowing) for why. |
| `VendorCredit` | `vendor_credits` | Canonical vendor credit — nets a refund against the category/item it hit, via a denormalized `lines` jsonb column. |
| `TransactionPayment` | `transaction_payments` | Canonical payment record — when a bill was actually paid. `appliedTransactions` (jsonb) records which transaction(s) it settles, since one payment can cover several. |

The advanced filter (`RecordsFilterService`, backing
`GET /records/expense-transaction-lines`) queries `ExpenseTransactionLine`
as its base table via TypeORM `QueryBuilder`, joining up to
`ExpenseTransaction` only for `transactionType`/`sourceSystem` — every other
filter dimension (vendor, category, item, tax rate, amount range, date
range) lives directly on the line.

## 7. The mapper: raw → canonical

Two services do the actual translation, split by the natural seam in the
build-order guide itself (the "Checkpoint" between master data and
transactions):

- **`QuickbooksMasterDataMapperService`** — Vendor → Vendor, Account →
  SpendCategory, Item → Item, TaxRate → TaxRate. Accounts are mapped in
  **two passes**: QuickBooks doesn't guarantee a parent Account arrives
  before its children, so every account is first upserted with
  `parentCategoryId: null`, then re-upserted once every row's canonical id
  exists and parents can actually be resolved.
- **`QuickbooksTransactionMapperService`** — Bill/Purchase → one shared
  `ExpenseTransaction` + `ExpenseTransactionLine[]` path (normalizing away
  the Bill-vs-Purchase and `ItemBasedExpenseLineDetail`-vs-
  `AccountBasedExpenseLineDetail` distinctions QuickBooks makes but the
  canonical model doesn't need), VendorCredit → VendorCredit, BillPayment →
  TransactionPayment.

Both mappers depend on `RecordsService` (writes) and `RecordsLookupService`
(resolves a `VendorRef`/`AccountRef`/`ItemRef` external id to the already-
mapped canonical row's uuid) — never the other way around. This is the
**only** place QuickBooks-specific concepts get translated into the generic
model, so a future Xero mapper is a parallel file, not a fork of this one.

## 8. Design decisions worth knowing

**Why `ExpenseTransactionLine` duplicates `organizationId`/`vendorId`/
`transactionDate` from its own parent.** The four hottest findings-engine
queries — "spend for org X this month," "this vendor's spend trend," "this
category's spend trend," "this item's price trend" — all need `WHERE
organization_id = ? AND transaction_date BETWEEN ? AND ?` plus one more
dimension that only exists at line grain (`category_id`, `item_id`). Rather
than joining up to the header for every row, those three columns are copied
onto the line at write time (the mapper is the only writer, so the copy
never drifts), letting four composite indexes on one table serve all four
queries directly.

**Why `VendorCredit`/`TransactionPayment`/`QuickbooksVendorCredit`/
`QuickbooksBillPayment` use a `jsonb` column instead of a child line table.**
The schema's entity list was scoped to exactly what building line-item
money-leak detection needs — and that's Bill and Purchase, which is why
those two got dedicated `*Line` tables. Credits and payments still need
enough detail to net against the right category or settle the right bill,
so that detail is kept as normalized JSON rather than left out — but a
relational `VendorCreditLine`/`BillPaymentLine` table is a reasonable
follow-up if credits ever need the same query power as expense lines.

**Why token encryption exists at all.** The original `QuickbooksConnection`
stored tokens in plaintext columns (guarded only by `select: false` +
`@Exclude()`). `ProviderConnection` adds AES-256-GCM encryption on top,
via a TypeORM column transformer — because a raw database dump/leak
shouldn't also hand out live QuickBooks/Xero credentials. The key comes
from `TOKEN_ENCRYPTION_KEY` (see `.env.example`); generate a real one with
`openssl rand -hex 32` before this ever touches production.

**Why ids are strings and money is `numeric`, never `float`.** Direct
build-order guide requirements: "store QuickBooks' Id fields as strings...
Intuit does not guarantee they stay numeric-only forever," and money
columns are `numeric(14,2)`/`numeric(14,4)` throughout (TypeORM returns
these as strings in JS, deliberately, to avoid floating-point precision
loss on financial data).

## 9. Quick-reference table: every entity

| Entity | Module | Table |
|---|---|---|
| `Organization` | organizations | `organizations` |
| `ProviderConnection` | providers | `provider_connections` |
| `SyncCursor` | providers | `sync_cursors` |
| `QuickbooksVendor` | quickbooks | `quickbooks_vendors` |
| `QuickbooksAccount` | quickbooks | `quickbooks_accounts` |
| `QuickbooksItem` | quickbooks | `quickbooks_items` |
| `QuickbooksTaxRate` | quickbooks | `quickbooks_tax_rates` |
| `QuickbooksBill` | quickbooks | `quickbooks_bills` |
| `QuickbooksBillLine` | quickbooks | `quickbooks_bill_lines` |
| `QuickbooksPurchase` | quickbooks | `quickbooks_purchases` |
| `QuickbooksPurchaseLine` | quickbooks | `quickbooks_purchase_lines` |
| `QuickbooksVendorCredit` | quickbooks | `quickbooks_vendor_credits` |
| `QuickbooksBillPayment` | quickbooks | `quickbooks_bill_payments` |
| `Vendor` | records | `vendors` |
| `SpendCategory` | records | `spend_categories` |
| `Item` | records | `items` |
| `TaxRate` | records | `tax_rates` |
| `ExpenseTransaction` | records | `expense_transactions` |
| `ExpenseTransactionLine` | records | `expense_transaction_lines` |
| `VendorCredit` | records | `vendor_credits` |
| `TransactionPayment` | records | `transaction_payments` |

Migrations live in `src/database/migrations/`, one file per module in this
same order: `AddOrganizations` → `AddProviderConnections` →
`AddQuickbooksRawEntities` → `AddRecordsCanonicalEntities`.

## 10. What's deliberately not built yet

- **OAuth → `ProviderConnection` wiring.** `QuickbooksAuthService` still
  writes to the legacy `quickbooks_connections` table only. Nothing yet
  creates a `ProviderConnection` row when a business connects QuickBooks.
- **The actual CDC sync loop** (build-order Step 9) that pulls QuickBooks
  data on a schedule/webhook and calls the mappers. The mappers exist and
  are unit-testable, but nothing currently invokes them end-to-end.
- **TaxCode → TaxRate resolution.** A Bill/Purchase line only carries a
  `TaxCodeRef` ("TAX"/"NON"), not a specific `TaxRate` id — QuickBooks'
  `TaxCode.SalesTaxRateList` expansion isn't modeled, so
  `ExpenseTransactionLine.taxRateId` is always `null` today;
  `taxCodeExternalRef` preserves the raw code for later.
- **Organization CRUD / self-serve signup.** `Organization` exists only as
  a schema anchor right now.
