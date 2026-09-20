# Dashboard Graph APIs — Proposal

Which GET APIs to build for the dashboard graphs, what each graph shows, and
which filters each one supports. Everything here is derived from data that
**already exists** in the schema (QuickBooks sync → canonical tables), so no
new tables are needed — only new read-only aggregate endpoints.

## 1. What we already have

Existing `analytics` module (`/analytics/...`), all scoped by `organizationId`:

| Endpoint | Gives us |
|---|---|
| `GET /analytics/expense-summary/total` | Total spend + line count for a date range (KPI card) |
| `GET /analytics/expense-summary/per-category` | Spend per category, sorted desc (this is already a pie/bar graph) |
| `GET /analytics/duplicate-transactions` | Possible duplicate groups |
| `GET /analytics/cost-increase/supplier` \| `/category` | Current-vs-prior period change, price- vs volume-driven |
| `GET /analytics/data-quality/issues/count` | "Needs Review" badge |

**Gap:** every existing endpoint returns a single number or a single grouped
list. There is **no time-series endpoint** (spend by day/week/month), **no
revenue analytics**, and **no vendor ranking** — and those are exactly what
dashboard graphs need.

## 2. Data available to chart

| Table | Grain / key columns | Good for |
|---|---|---|
| `expense_transaction_lines` | `amount`, `quantity`, `unitPrice`, `transactionDate`, `vendorId`, `categoryId`, `itemId`, `taxRateId` | Spend by time / category / vendor / item |
| `expense_transactions` | `transactionType` (bill/purchase), `paymentMethod`, `totalAmount`, `balance`, `dueDate`, `vendorId` | Bill vs purchase split, payment method split, outstanding payables |
| `sales_transaction_lines` / `sales_transactions` | Mirror of expense side, with `customerId`, `transactionType` (invoice/sales_receipt), `balance`, `dueDate` | Revenue by time / customer / category, receivables |
| `vendor_credits`, `transaction_payments`, `customer_payments` | `totalAmount`, date | Net spend, cash-out / cash-in over time |
| `spend_categories` | `name`, `categoryType`, `parentCategoryId` | Category labels, roll-up to parent |

Existing composite indexes already cover the hot shapes
(`org+date`, `org+vendor+date`, `org+category+date`, `org+item+date`) on both
line tables, so the queries below should be index-backed with no migration.

## 3. Recommended graphs (start with these 3)

### Graph 1 — Spend Over Time (line / area chart)

**Question answered:** "How is my spend trending, and is it going up?"

```
GET /analytics/dashboard/spend-trend
```

| Filter | Type | Notes |
|---|---|---|
| `organizationId` | uuid, required | Same ownership check as existing endpoints (admin can pick any org) |
| `dateFrom`, `dateTo` | date, required | |
| `granularity` | `day` \| `week` \| `month` | Default `month`. Maps to `date_trunc()` |
| `vendorIds` | uuid[] (comma-separated) | Optional |
| `categoryIds` | uuid[] | Optional |
| `itemIds` | uuid[] | Optional |
| `transactionType` | `bill` \| `purchase` | Needs a join to the header; optional |
| `compareToPrevious` | boolean | If true, also return the same-length prior period so the chart can overlay it |

**Response:**
```json
{
  "granularity": "month",
  "points": [
    { "period": "2026-06-01", "totalSpend": 12450.10, "lineCount": 88 },
    { "period": "2026-07-01", "totalSpend": 14210.00, "lineCount": 97 }
  ],
  "previousPoints": [ ... ]
}
```
**Implementation:** one `GROUP BY date_trunc(:granularity, transactionDate)`
on `expense_transaction_lines`. Gaps (months with no spend) should be filled
with `generate_series` so the line doesn't skip periods.

---

### Graph 2 — Top Vendors / Categories (horizontal bar or donut)

**Question answered:** "Where is my money going?"

```
GET /analytics/dashboard/spend-breakdown
```

| Filter | Type | Notes |
|---|---|---|
| `organizationId`, `dateFrom`, `dateTo` | required | |
| `groupBy` | `vendor` \| `category` \| `item` | Required — one endpoint drives three graphs |
| `limit` | int 1–20, default 5 | Top-N; remainder rolled into an `Other` row |
| `vendorIds` / `categoryIds` / `itemIds` | uuid[] | Cross-filters (e.g. category = Materials, group by vendor) |
| `categoryType` | string | Restrict to e.g. `Expense` / `Cost of Goods Sold` only |
| `minAmount` | number | Hide tiny rows |
| `includeCredits` | boolean | Subtract `vendor_credits` so refunds don't inflate spend |

**Response:**
```json
{
  "groupBy": "vendor",
  "total": 48200.00,
  "rows": [
    { "id": "…", "name": "Norton Lumber", "totalSpend": 12400.00, "sharePct": 25.7, "lineCount": 31 },
    { "id": null, "name": "Other", "totalSpend": 6100.00, "sharePct": 12.7, "lineCount": 40 }
  ]
}
```
**Note:** `per-category` already exists but is unbounded and only groups by
category. This endpoint generalizes it (vendor/item too) and adds Top-N +
share-of-total, which charts need. Keep the old one untouched.

---

### Graph 3 — Revenue vs Spend (grouped bar or dual line)

**Question answered:** "Am I making more than I spend?"

```
GET /analytics/dashboard/revenue-vs-spend
```

| Filter | Type | Notes |
|---|---|---|
| `organizationId`, `dateFrom`, `dateTo` | required | |
| `granularity` | `week` \| `month` \| `quarter` | Default `month` |
| `customerIds` | uuid[] | Filters the revenue side only |
| `vendorIds` | uuid[] | Filters the spend side only |
| `categoryIds` | uuid[] | Applies to both sides (same `spend_categories` table) |

**Response:**
```json
{
  "granularity": "month",
  "points": [
    { "period": "2026-07-01", "revenue": 31000.00, "spend": 14210.00, "net": 16790.00 }
  ]
}
```
**Implementation:** two aggregates (`sales_transaction_lines`,
`expense_transaction_lines`) each grouped by period, merged on the period key.
Run them in parallel with `Promise.all`; do not merge row-by-row in app code.

---

## 4. Additional graphs (phase 2 — pick as needed)

| # | Graph | Endpoint | Key filters |
|---|---|---|---|
| 4 | **Top Customers** (bar) | `GET /analytics/dashboard/revenue-breakdown` | `groupBy=customer\|category\|item`, `limit`, date range, `customerIds` |
| 5 | **Bills vs Purchases / Payment method** (donut) | `GET /analytics/dashboard/spend-by-type` | `by=transactionType\|paymentMethod`, date range, `vendorIds` |
| 6 | **Payables & Receivables aging** (stacked bar) | `GET /analytics/dashboard/aging` | `side=payable\|receivable`; buckets current / 1–30 / 31–60 / 61–90 / 90+ from `dueDate` + `balance`; optional `vendorIds`/`customerIds` |
| 7 | **Cash flow** (bar, in vs out) | `GET /analytics/dashboard/cash-flow` | `granularity`, date range; uses `customer_payments` (in) and `transaction_payments` (out) |
| 8 | **Biggest cost increases** (ranked bar) | `GET /analytics/dashboard/top-increases` | `currentFrom/To`, `priorFrom/To`, `groupBy=vendor\|category`, `limit`; reuses the existing cost-increase logic across all entities instead of one |
| 9 | **Data-quality trend** (small line) | `GET /analytics/dashboard/data-quality-trend` | `granularity`, date range; issues per period (no vendor / non-positive amount) |

Also handy as KPI cards above the graphs: total spend (exists), total revenue,
net, outstanding payables, outstanding receivables, vendor count. A single
`GET /analytics/dashboard/kpis` (with `dateFrom/dateTo` and an optional
`compareToPrevious`) returns them all in one round-trip so the page doesn't
fire six requests on load.

## 5. Shared filter contract

Define **once** as a base DTO in `analytics/dto` (e.g.
`DashboardFilterQueryDto`) and extend it per endpoint, instead of redeclaring
per controller. The list-parsing logic (`toUuidArray`, `toNumber`) already
exists in the `records` DTOs — reuse it.

| Param | Type | Default | Applies to |
|---|---|---|---|
| `organizationId` | uuid | required | all |
| `dateFrom` / `dateTo` | ISO date | required | all |
| `preset` (optional sugar) | `last_30_days` \| `this_month` \| `last_month` \| `this_quarter` \| `ytd` | — | resolved server-side to dates; lets the UI offer quick ranges |
| `granularity` | `day\|week\|month\|quarter` | `month` | time-series graphs |
| `vendorIds`, `categoryIds`, `itemIds`, `customerIds` | uuid[] | — | as relevant |
| `compareToPrevious` | boolean | `false` | time-series + KPIs |
| `sourceSystem` | enum | — | when more than one provider is connected |

Suggested guardrails:
- Cap the date range (e.g. ≤ 2 years) and cap `granularity=day` to ≤ 366 points.
- Cap `limit` at 20 for Top-N graphs.
- Validate `dateFrom <= dateTo`.

## 6. Implementation notes (per CLAUDE.md)

- **Where:** `analytics` module. Add a `DashboardController`
  (`@Controller('analytics/dashboard')`) rather than growing
  `AnalyticsController`, plus focused services in `services/`
  (`SpendTrendService`, `SpendBreakdownService`, `RevenueVsSpendService`, …),
  each with a `.spec.ts`. New DTOs go in `dto/` with barrel exports.
- **Additive only:** existing analytics/records endpoints stay as-is.
- **Auth:** reuse the same `assertOwnOrganization` / admin check used by
  `ExpenseSummaryService` — non-admins can only query their own org.
- **Performance:** all aggregates are single SQL `GROUP BY` queries on the
  indexed line tables; never paginate-and-sum in app code. Run `EXPLAIN
  ANALYZE` on the trend and breakdown queries with a realistic row count.
- **Money:** `numeric` comes back from Postgres as a string — convert with
  `Number()` in the service (as the existing services do).
- **Currency:** rows carry a `currency` column. The existing endpoints ignore
  it; decide whether the dashboard assumes one currency per org or returns a
  currency field (open question below).
- **Caching (optional):** dashboard data only changes on QuickBooks sync, so
  responses could be cached per `(org, query)` and invalidated on sync
  completion.
- **Migrations:** none required for graphs 1–3. If aging (graph 6) is slow at
  scale, consider an index on `(organizationId, dueDate)` for
  `expense_transactions` / `sales_transactions` (use `CREATE INDEX
  CONCURRENTLY`).

## 7. Suggested build order

1. `DashboardFilterQueryDto` + `GET .../kpis`
2. Graph 1 — spend-trend
3. Graph 2 — spend-breakdown
4. Graph 3 — revenue-vs-spend
5. Phase 2 graphs as the UI needs them

## 8. Open questions

1. Do we want revenue on the dashboard in the MVP? (Project context says the
   MVP is the AP/spend side; the revenue tables exist but graph 3 depends on
   them being synced.)
2. Single currency per organization, or multi-currency?
3. Should "spend" include or exclude vendor credits by default?
4. Should the dashboard restrict to spend-type categories (`categoryType`
   such as Expense / COGS) by default, since `spend_categories` currently
   holds every account type (bank, credit card, etc.)?
5. Fixed presets in the UI, or free date pickers only?
