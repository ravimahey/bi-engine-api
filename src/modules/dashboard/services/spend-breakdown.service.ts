import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { ExpenseTransactionLine } from '@modules/records/entities';
import { OTHER_ROW_NAME, UNASSIGNED_ROW_NAME } from '../constants';
import type { BreakdownGroup } from '../constants';
import { SpendBreakdownQueryDto } from '../dto';
import type { BreakdownRaw, BreakdownTotalRaw } from '../types';
import { assertDashboardAccess } from '../utils';

const GROUPS: Record<
  BreakdownGroup,
  { relation: string; alias: string; idColumn: string; nameColumn: string }
> = {
  vendor: {
    relation: 'line.vendor',
    alias: 'vendor',
    idColumn: 'line.vendorId',
    nameColumn: 'vendor.displayName',
  },
  category: {
    relation: 'line.category',
    alias: 'category',
    idColumn: 'line.categoryId',
    nameColumn: 'category.name',
  },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Graph 2 — top-N vendors or categories by spend, with the rest rolled into
 * one "Other" row so the shares always add up to 100%. The top-N and the
 * grand total are two aggregates over the same filters, run in parallel.
 */
@Injectable()
export class SpendBreakdownService {
  constructor(
    @InjectRepository(ExpenseTransactionLine)
    private readonly lines: Repository<ExpenseTransactionLine>,
  ) {}

  async getSpendBreakdown(
    query: SpendBreakdownQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    assertDashboardAccess(query.organizationId, currentUser);

    const group = GROUPS[query.groupBy];

    const [topRows, totalRaw] = await Promise.all([
      this.filtered(query)
        .leftJoin(group.relation, group.alias)
        .select(group.idColumn, 'id')
        .addSelect(group.nameColumn, 'name')
        .addSelect('SUM(line.amount)', 'totalSpend')
        .addSelect('COUNT(*)', 'lineCount')
        .groupBy(group.idColumn)
        .addGroupBy(group.nameColumn)
        .orderBy('SUM(line.amount)', 'DESC')
        .limit(query.limit)
        .getRawMany<BreakdownRaw>(),
      this.filtered(query)
        .select('COALESCE(SUM(line.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'lineCount')
        .getRawOne<BreakdownTotalRaw>(),
    ]);

    const total = Number(totalRaw?.total ?? 0);
    const share = (amount: number): number =>
      total > 0 ? round2((amount / total) * 100) : 0;

    const rows = topRows.map((row) => ({
      id: row.id,
      name: row.name ?? UNASSIGNED_ROW_NAME,
      totalSpend: Number(row.totalSpend),
      sharePct: share(Number(row.totalSpend)),
      lineCount: Number(row.lineCount),
    }));

    const otherSpend = round2(
      total - rows.reduce((sum, row) => sum + row.totalSpend, 0),
    );
    if (otherSpend > 0) {
      rows.push({
        id: null,
        name: OTHER_ROW_NAME,
        totalSpend: otherSpend,
        sharePct: share(otherSpend),
        lineCount:
          Number(totalRaw?.lineCount ?? 0) -
          rows.reduce((sum, row) => sum + row.lineCount, 0),
      });
    }

    return { groupBy: query.groupBy, total, rows };
  }

  private filtered(
    query: SpendBreakdownQueryDto,
  ): SelectQueryBuilder<ExpenseTransactionLine> {
    const qb = this.lines
      .createQueryBuilder('line')
      .where('line.organizationId = :organizationId', {
        organizationId: query.organizationId,
      })
      .andWhere('line.transactionDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
    if (query.vendorIds?.length) {
      qb.andWhere('line.vendorId IN (:...vendorIds)', {
        vendorIds: query.vendorIds,
      });
    }
    if (query.categoryIds?.length) {
      qb.andWhere('line.categoryId IN (:...categoryIds)', {
        categoryIds: query.categoryIds,
      });
    }
    return qb;
  }
}
