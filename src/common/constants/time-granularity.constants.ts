/**
 * Bucket sizes a time-series graph can group by — mapped to Postgres
 * `date_trunc` units. Domain-agnostic and used by 2+ modules (`dashboard`,
 * `admin`), so it lives here rather than being redeclared in each one.
 */
export const TIME_GRANULARITIES = ['day', 'week', 'month'] as const;
export type TimeGranularity = (typeof TIME_GRANULARITIES)[number];
