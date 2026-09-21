import type { ObjectLiteral, Repository } from 'typeorm';
import type { TimeGranularity } from '@common/constants';

export interface CountByPeriodParams {
  /** Query alias, also the column prefix (`${alias}.createdAt`). */
  alias: string;
  dateFrom: string;
  /** Exclusive upper bound — see `resolveDashboardRange`. */
  dateToExclusive: string;
  granularity: TimeGranularity;
  /** Extra `WHERE` clause + its params, e.g. excluding admin accounts from user growth. */
  extraWhere?: [clause: string, params: ObjectLiteral];
}

export interface PeriodCount {
  period: string;
  count: number;
}

/**
 * `COUNT(*)` per time bucket of `createdAt` over one table — mirrors the
 * dashboard module's `sumAmountByPeriod` (one SQL `GROUP BY`, never a
 * per-row loop). `granularity` is validated against a fixed enum by the
 * DTO, so it is safe to inline (`date_trunc` can't take a bound parameter
 * that is also in the `GROUP BY`).
 */
export async function countByPeriod(
  repo: Repository<ObjectLiteral>,
  {
    alias,
    dateFrom,
    dateToExclusive,
    granularity,
    extraWhere,
  }: CountByPeriodParams,
): Promise<PeriodCount[]> {
  const bucket = `to_char(date_trunc('${granularity}', ${alias}.createdAt), 'YYYY-MM-DD')`;

  const qb = repo
    .createQueryBuilder(alias)
    .select(bucket, 'period')
    .addSelect('COUNT(*)', 'count')
    .where(`${alias}.createdAt >= :dateFrom`, { dateFrom })
    .andWhere(`${alias}.createdAt < :dateToExclusive`, { dateToExclusive });

  if (extraWhere) {
    const [clause, params] = extraWhere;
    qb.andWhere(clause, params);
  }

  const rows = await qb
    .groupBy('period')
    .orderBy('period', 'ASC')
    .getRawMany<{ period: string; count: string }>();

  return rows.map((row) => ({ period: row.period, count: Number(row.count) }));
}
