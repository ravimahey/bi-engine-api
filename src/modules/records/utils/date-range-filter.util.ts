import {
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  type FindOperator,
} from 'typeorm';

/**
 * Turns an optional `dateFrom`/`dateTo` query pair into the right TypeORM
 * `FindOptionsWhere` operator for a date column — `Between` when both are
 * given, an open-ended bound when only one is, `undefined` when neither is
 * (spread away by the caller). Shared by every header/list service in this
 * module that filters a date column but has no other reason to reach for
 * `QueryBuilder`.
 */
export function dateRangeFilter(
  dateFrom?: string,
  dateTo?: string,
): FindOperator<string> | undefined {
  if (dateFrom && dateTo) return Between(dateFrom, dateTo);
  if (dateFrom) return MoreThanOrEqual(dateFrom);
  if (dateTo) return LessThanOrEqual(dateTo);
  return undefined;
}
