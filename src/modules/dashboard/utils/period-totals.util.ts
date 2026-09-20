import type { ObjectLiteral, Repository } from 'typeorm';
import type { TimeGranularity } from '../constants';
import type { PeriodTotalRaw } from '../types';

export interface PeriodTotalsParams {
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  granularity: TimeGranularity;
  /** `[column, ids]` pairs — a pair with no ids is ignored. */
  idFilters?: [column: string, ids: string[] | undefined][];
}

export interface PeriodTotal {
  period: string;
  totalAmount: number;
  lineCount: number;
}

/**
 * `SUM(amount)` per time bucket over one line table (expense or sales lines
 * — both share the same column names). One SQL `GROUP BY`, never a per-row
 * loop. `granularity` is validated against a fixed enum by the DTO, so it is
 * safe to inline (`date_trunc` can't take a bound parameter that is also in
 * the GROUP BY).
 */
export async function sumAmountByPeriod(
  repo: Repository<ObjectLiteral>,
  params: PeriodTotalsParams,
): Promise<PeriodTotal[]> {
  const bucket = `to_char(date_trunc('${params.granularity}', CAST(line.transactionDate AS timestamp)), 'YYYY-MM-DD')`;

  const qb = repo
    .createQueryBuilder('line')
    .select(bucket, 'period')
    .addSelect('SUM(line.amount)', 'totalAmount')
    .addSelect('COUNT(*)', 'lineCount')
    .where('line.organizationId = :organizationId', {
      organizationId: params.organizationId,
    })
    .andWhere('line.transactionDate BETWEEN :dateFrom AND :dateTo', {
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });

  params.idFilters?.forEach(([column, ids], index) => {
    if (ids?.length) {
      qb.andWhere(`${column} IN (:...ids${index})`, { [`ids${index}`]: ids });
    }
  });

  const rows = await qb
    .groupBy('period')
    .orderBy('period', 'ASC')
    .getRawMany<PeriodTotalRaw>();

  return rows.map((row) => ({
    period: row.period,
    totalAmount: Number(row.totalAmount),
    lineCount: Number(row.lineCount),
  }));
}
