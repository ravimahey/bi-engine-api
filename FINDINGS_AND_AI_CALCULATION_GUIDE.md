# Findings Engine + AI: How to Calculate on the Whole Database (Not Just One Page)

Plain-language guide for building: **expense calculation, duplicate invoice
detection, money-leak (cost/supplier increase) findings, and missing/wrong
transaction detection** — and where AI/LangChain actually belongs in that
picture. Written to answer one specific question: *"I have 1,000 records,
pagination only gives me 10 at a time — how do I calculate on all 1,000?"*

---

## 1. The one-sentence answer

**Pagination is only for what you *show* the user. It is never for what you
*calculate*.** Calculating and paginating are two completely different
questions asked of the database, and you should never let the second one
answer the first.

- "Give me rows 1–10 so I can display a table" → paginated query.
- "Give me the total spend / duplicate count / cost increase" → a
  **separate** query that runs over *all* rows and returns one small
  answer (a few numbers), not a list of rows at all.

You are not "missing" 990 records because of pagination. Pagination was
never supposed to be involved in the calculation in the first place — that's
the misconception to drop.

## 2. The analogy

Imagine asking a librarian "how many books are in the library?" The
librarian doesn't hand you the 10 books currently on the front counter and
say "here, count these." They walk into the stacks, count (or already know
the count from their own ledger), and come back with one number: "14,302."

Your database is the librarian. `SELECT SUM(total_amount) FROM
expense_transaction_lines WHERE organization_id = $1` walks every row in
Postgres — not 10, not "however many fit on a page" — and hands back one
number. The pagination you use for the *list* screen (`GET
/expense-transactions?page=2`) is a completely different endpoint, doing a
completely different query, and the two never need to agree on how many
rows they touch.

## 3. Three techniques for "calculate over everything" — pick per feature

| # | Technique | What it means | When to use it |
|---|---|---|---|
| 1 | **SQL aggregate query** | `SUM`/`COUNT`/`GROUP BY`/window functions, run once, in Postgres, over the whole table | Default choice. Anything expressible as "total/count/group by X" — which is almost everything in this doc. |
| 2 | **Backend batch scan** | Your NestJS service reads the table in internal chunks (e.g. 500 rows at a time, in a loop, inside one request) and accumulates a result — but the *caller* never sees those chunks, only the final answer | Only when the logic genuinely can't be expressed in SQL (rare for these four features) |
| 3 | **Precompute once, store the answer** | Calculate the number when data is imported/synced, save it in a small summary table/column, read it instantly later | Dashboard KPIs that get read constantly but only change when new data arrives |

For all four features you listed, **technique 1 (SQL aggregate) covers
almost everything**, with technique 3 layered on top for the dashboard once
it needs to feel instant at scale. You will not need technique 2 for any of
the four MVP findings — flag it only if a future finding needs logic SQL
truly can't express (e.g. fuzzy text matching across suppliers).

The engineering guide already enforces the paginate-the-list rule
(`CLAUDE.md`: *"Always paginate list endpoints… never unbounded
`find()`"*) — that rule is about list/display endpoints. A summary/KPI/
findings endpoint is a different kind of endpoint: it returns a handful of
numbers, so it's exempt from that rule by nature — there's no list to
paginate.

## 4. Each feature, mapped to a real query

All four live naturally as new services in a new `modules/findings` module
(see [§6](#6-suggested-module-layout)), reading the canonical
`expense_transactions` / `expense_transaction_lines` tables described in
`SPEND_ANALYTICS_SCHEMA.md` — which already has the indexes these queries
need.

### 4.1 Expense calculation (dashboard totals / KPIs)

One `GROUP BY`, no loop, no pagination involved at all:

```ts
// services/expense-summary.service.ts
async getCategorySpend(organizationId: string, from: string, to: string) {
  return this.lineRepo
    .createQueryBuilder('line')
    .select('line.categoryId', 'categoryId')
    .addSelect('SUM(line.amount)', 'totalSpend')
    .where('line.organizationId = :organizationId', { organizationId })
    .andWhere('line.transactionDate BETWEEN :from AND :to', { from, to })
    .groupBy('line.categoryId')
    .getRawMany();
}
```

This runs over every matching row in Postgres in one round trip — 10 rows
or 10 million, the query is identical. This is what powers `Total Spend`,
`Spend Change`, and the trend chart on the KPI dashboard (ORD-05).

### 4.2 Duplicate invoice detection

Same shape: group by the fields that define "the same invoice," and keep
only the groups that appear more than once.

```ts
async findPossibleDuplicates(organizationId: string) {
  return this.transactionRepo
    .createQueryBuilder('t')
    .select(['t.vendorId', 't.transactionDate', 't.totalAmount'])
    .addSelect('COUNT(*)', 'occurrences')
    .addSelect('ARRAY_AGG(t.id)', 'transactionIds')
    .where('t.organizationId = :organizationId', { organizationId })
    .groupBy('t.vendorId, t.transactionDate, t.totalAmount')
    .having('COUNT(*) > 1')
    .getRawMany();
}
```

Same supplier + same date + same amount appearing twice (the PDF's
"ABC Supplies, $2,150, same date, twice" example) comes back as one row with
`occurrences = 2` and both transaction IDs — evaluated across the entire
table in one pass. If you later add an explicit invoice/reference-number
column, add it to the `GROUP BY` to tighten the match.

### 4.3 Money-leak findings (category / supplier cost increase)

This is "the same aggregate query, run twice for two periods, then
compared" — still pure SQL, still one pass over all rows per period:

```ts
async getSupplierSpendChange(organizationId: string, vendorId: string,
    currentFrom: string, currentTo: string, priorFrom: string, priorTo: string) {
  const [current, prior] = await Promise.all([
    this.sumSpend(organizationId, vendorId, currentFrom, currentTo),
    this.sumSpend(organizationId, vendorId, priorFrom, priorTo),
  ]);
  return { current, prior, change: current - prior };
}
```

To honor the "don't call volume growth a savings opportunity" rule from the
rollout plan (E2E-02), also pull `SUM(qty)` alongside `SUM(amount)` per
period — if quantity rose roughly in line with spend, the finding is
volume-driven; if spend rose while quantity held steady, it's price-driven.
That split is itself just two more columns in the same `GROUP BY`, not a
second technique.

### 4.4 Missing / wrong transaction (data quality)

Also a full-table query — but here you usually want `COUNT`, not the rows
themselves, for the dashboard's "Needs Review" badge, plus a **paginated**
follow-up query to let the user actually see which rows are wrong:

```ts
// Count for the badge — one number, over everything:
async countIssues(organizationId: string) {
  return this.transactionRepo
    .createQueryBuilder('t')
    .where('t.organizationId = :organizationId', { organizationId })
    .andWhere(new Brackets((qb) => {
      qb.where('t.vendorId IS NULL')
        .orWhere('t.totalAmount <= 0')
        .orWhere('t.transactionDate IS NULL');
    }))
    .getCount();
}

// Rows for the "review these" screen — THIS one is where pagination belongs:
async listIssues(organizationId: string, page: number, limit: number) {
  return this.transactionRepo
    .createQueryBuilder('t')
    .where(/* same conditions as above */)
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();
}
```

This is the pattern for every feature here: **one unpaginated query for the
number, one paginated query for the list a human actually clicks through.**
They're siblings, not the same query reused twice.

## 5. Where AI and LangChain actually belong

This is the part the two PDFs (`Ordaraa_AI_Role_in_BI_Intelligence...` and
the rollout plan) are explicit about, and it directly resolves your original
worry: **the AI is never the thing doing the calculation, so it never needs
to "see" all 1,000 rows.** The database already did the counting. AI's job
starts *after* that.

> "BI calculates and proves; AI explains, recommends and converses; the
> owner decides and acts." — `Ordaraa_AI_Role_in_BI_Intelligence_Development_Guide`

### The wrong way (what your instinct was rightly worried about)

```
Loop through pages 1..100 → collect rows → paste all rows into an LLM
prompt → ask the LLM "what's the total, and is anything a duplicate?"
```

This is wrong for three independent reasons, not just cost/context-window
size: the LLM can silently get arithmetic wrong on financial data, the
result isn't reproducible (same data, different answer on a re-run), and it
violates the project's own rule that AI must never be the source of a
financial number. Don't build this, even as a "temporary" shortcut.

### The right way: AI calls a tool, the tool calls your service

LangChain's actual job here is **function/tool calling** for the "Ask
Ordaraa" chat (ORD-10) — nothing more. You define a small set of tools,
each one a thin wrapper around a service from §4. The LLM decides *which*
tool answers the user's question and with *which arguments*; your NestJS
code runs the real, deterministic, full-table query; the LLM only ever
receives the **already-computed result** (a handful of numbers), never raw
rows.

```ts
// modules/findings-ai/tools/supplier-spend-change.tool.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function buildSupplierSpendChangeTool(
  findingsService: FindingsService,
  organizationId: string, // bound from the authenticated request — never model-supplied
) {
  return new DynamicStructuredTool({
    name: 'get_supplier_spend_change',
    description:
      "Get a vendor's spend change between two date ranges, already calculated.",
    schema: z.object({
      vendorId: z.string().uuid(),
      currentFrom: z.string(), currentTo: z.string(),
      priorFrom: z.string(), priorTo: z.string(),
    }),
    func: async (args) =>
      JSON.stringify(
        await findingsService.getSupplierSpendChange(organizationId, ...Object.values(args)),
      ),
  });
}
```

The agent loop then looks like: user asks *"Why did packaging spend go
up?"* → LLM picks `get_supplier_spend_change` (or the category equivalent)
→ your service runs the one `GROUP BY` query over the whole table → LLM
gets back `{ current: 11000, prior: 8000, change: 3000 }` → LLM turns that
into a sentence: *"Packaging spend rose from $8,000 to $11,000, mostly
driven by ABC Supplies."* The LLM never touched a page, a row, or a loop —
it touched one JSON object with three numbers in it.

This is also exactly what makes tenant isolation and the "no cross-tenant
answers" guardrail trivial to enforce: `organizationId` is bound into the
tool from the authenticated request server-side, never something the model
can pass in or override — so there's no path for the LLM to even ask about
another business's data.

### Rule of thumb

If a number appears in a chat response, ask "which SQL query produced this
number?" If the honest answer is "the LLM computed it," that's a bug. If
the answer is "tool X ran and returned it," that's correct — regardless of
whether the underlying table has 10 rows or 10 million.

## 6. Suggested module layout

Following this backend's existing convention (`CLAUDE.md`: every module
gets `services/`, `constants/`, `types/` as needed, plus a barrel
`index.ts` per subfolder):

```
src/modules/findings/
  services/
    expense-summary.service.ts        # §4.1
    duplicate-detection.service.ts    # §4.2
    cost-increase-finding.service.ts  # §4.3 (category + supplier)
    data-quality.service.ts           # §4.4
    index.ts
  constants/
    findings.constants.ts             # thresholds, e.g. "flag if change > 15%"
    index.ts
  types/
    finding.types.ts
    index.ts
  findings.controller.ts              # thin: DTO in → service call → shape out
  findings.module.ts

src/modules/findings-ai/
  tools/
    supplier-spend-change.tool.ts     # wraps FindingsService, per §5
    category-spend-change.tool.ts
    duplicate-check.tool.ts
    index.ts
  services/
    ask-ordaraa.service.ts            # builds the agent, binds organizationId, runs the loop
    index.ts
  findings-ai.controller.ts
  findings-ai.module.ts
```

`findings-ai` depends on `findings` (imports its services to build tools);
`findings` never depends on `findings-ai` — the same one-directional
dependency shape already used between `records` and the provider modules in
`SPEND_ANALYTICS_SCHEMA.md`.

## 7. The one thing to remember

You don't need AI, and you don't need LangChain, to calculate across 1,000
rows — Postgres already does that in one query, instantly, and that's
technique #1 from §3. LangChain's only job in this project is to let the
chat feature *call* those already-correct numbers and *narrate* them in
plain English. Pagination stays exactly where it is today — on the list
screens — and never touches a calculation again.
