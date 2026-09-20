import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import { ExpenseTransactionLine } from '@modules/records/entities';
import { UserRole } from '@modules/users/entities';
import { ExpenseSummaryQueryDto } from '../dto';
import type { CategorySpendRaw, TotalSpendRaw } from '../types';

/**
 * Dashboard KPI totals — FINDINGS_AND_AI_CALCULATION_GUIDE.md §4.1. Every
 * method here is a single SQL aggregate (SUM/COUNT/GROUP BY) run once over
 * every matching row in Postgres; there is no pagination and no per-row
 * loop, because these endpoints hand back a handful of numbers, not a list
 * — the "always paginate list endpoints" rule doesn't apply here since
 * there's no list to paginate.
 */
@Injectable()
export class ExpenseSummaryService {
  constructor(
    @InjectRepository(ExpenseTransactionLine)
    private readonly lines: Repository<ExpenseTransactionLine>,
  ) {}

  async getTotalSpend(
    query: ExpenseSummaryQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    this.assertAccess(query.organizationId, currentUser);

    const raw = await this.lines
      .createQueryBuilder('line')
      .select('COALESCE(SUM(line.amount), 0)', 'totalSpend')
      .addSelect('COUNT(*)', 'lineCount')
      .where('line.organizationId = :organizationId', {
        organizationId: query.organizationId,
      })
      .andWhere('line.transactionDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      })
      .getRawOne<TotalSpendRaw>();

    return {
      totalSpend: Number(raw?.totalSpend ?? 0),
      lineCount: Number(raw?.lineCount ?? 0),
    };
  }

  async getCategorySpend(
    query: ExpenseSummaryQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    this.assertAccess(query.organizationId, currentUser);

    const raw = await this.lines
      .createQueryBuilder('line')
      .leftJoin('line.category', 'category')
      .select('line.categoryId', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('SUM(line.amount)', 'totalSpend')
      .addSelect('COUNT(*)', 'lineCount')
      .where('line.organizationId = :organizationId', {
        organizationId: query.organizationId,
      })
      .andWhere('line.transactionDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      })
      .groupBy('line.categoryId')
      .addGroupBy('category.name')
      .orderBy('SUM(line.amount)', 'DESC')
      .getRawMany<CategorySpendRaw>();

    return raw.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      totalSpend: Number(row.totalSpend),
      lineCount: Number(row.lineCount),
    }));
  }

  private assertAccess(
    organizationId: string,
    currentUser: AuthenticatedUser,
  ): void {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(currentUser.organizationId, organizationId);
    }
  }
}
