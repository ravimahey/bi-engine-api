/**
 * Raw shapes TypeORM's `getRawMany`/`getRawOne` hand back for aggregate
 * queries — Postgres `numeric`/`bigint` columns always come back as strings,
 * so these stay string-typed and get cast to `number` only once, at the
 * service boundary, before the DTO shape leaves the module.
 */
export interface TotalSpendRaw {
  totalSpend: string | null;
  lineCount: string;
}

export interface CategorySpendRaw {
  categoryId: string | null;
  categoryName: string | null;
  totalSpend: string;
  lineCount: string;
}

/** `ARRAY_AGG` on a `uuid` column comes back as a real string array already. */
export interface DuplicateTransactionGroupRaw {
  vendorId: string | null;
  vendorName: string | null;
  transactionDate: string;
  totalAmount: string;
  currency: string;
  occurrences: string;
  transactionIds: string[];
}

/** A duplicate group as in-process callers see it — the API shape plus the currency its amount is in. */
export interface DuplicateGroupWithCurrency {
  vendorId: string | null;
  vendorName: string | null;
  transactionDate: string;
  totalAmount: number;
  currency: string;
  occurrences: number;
  transactionIds: string[];
}

export interface SpendPeriodRaw {
  totalSpend: string | null;
  totalQty: string | null;
}

/** Already cast to `number` — the shape `CostIncreaseFindingService` computes with. */
export interface SpendPeriod {
  totalSpend: number;
  totalQty: number;
}

/**
 * `'unknown'` means the qty/percent data needed to classify the increase
 * isn't available (e.g. no prior-period quantity to compare against) — kept
 * distinct from `'none'` (there simply was no increase to classify).
 */
export type SpendChangeDriver =
  'price' | 'volume' | 'mixed' | 'none' | 'unknown';

/** Two inclusive `YYYY-MM-DD` windows a spend change is measured between. */
export interface SpendChangeWindows {
  currentFrom: string;
  currentTo: string;
  priorFrom: string;
  priorTo: string;
}

export interface CategorySpendWindowsRaw {
  categoryId: string;
  categoryName: string;
  currentSpend: string;
  currentQty: string;
  priorSpend: string;
  priorQty: string;
}

/** A category whose spend rose past the finding threshold while quantity held flat. */
export interface CategoryPriceIncrease {
  categoryId: string;
  categoryName: string;
  spendChangePercent: number;
}
