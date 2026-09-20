import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { ExpenseTransactionLine } from '@modules/records/entities';
import { SpendTrendQueryDto } from '../dto';
import { assertDashboardAccess, sumAmountByPeriod } from '../utils';

/** Graph 1 — spend per day/week/month, optionally narrowed to vendors/categories. */
@Injectable()
export class SpendTrendService {
  constructor(
    @InjectRepository(ExpenseTransactionLine)
    private readonly lines: Repository<ExpenseTransactionLine>,
  ) {}

  async getSpendTrend(
    query: SpendTrendQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    assertDashboardAccess(query.organizationId, currentUser);

    const rows = await sumAmountByPeriod(this.lines, {
      organizationId: query.organizationId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      granularity: query.granularity,
      idFilters: [
        ['line.vendorId', query.vendorIds],
        ['line.categoryId', query.categoryIds],
      ],
    });

    return {
      granularity: query.granularity,
      points: rows.map((row) => ({
        period: row.period,
        totalSpend: row.totalAmount,
        lineCount: row.lineCount,
      })),
    };
  }
}
