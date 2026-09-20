import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import {
  ExpenseTransactionLine,
  SalesTransactionLine,
} from '@modules/records/entities';
import { RevenueVsSpendQueryDto } from '../dto';
import { assertDashboardAccess, sumAmountByPeriod } from '../utils';

/**
 * Graph 3 — revenue and spend per bucket side by side. Two SQL aggregates
 * (one per line table) run in parallel; only the small per-period result
 * sets are merged in memory, on the period key.
 */
@Injectable()
export class RevenueVsSpendService {
  constructor(
    @InjectRepository(ExpenseTransactionLine)
    private readonly expenseLines: Repository<ExpenseTransactionLine>,
    @InjectRepository(SalesTransactionLine)
    private readonly salesLines: Repository<SalesTransactionLine>,
  ) {}

  async getRevenueVsSpend(
    query: RevenueVsSpendQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    assertDashboardAccess(query.organizationId, currentUser);

    const base = {
      organizationId: query.organizationId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      granularity: query.granularity,
    };
    const [revenueRows, spendRows] = await Promise.all([
      sumAmountByPeriod(this.salesLines, {
        ...base,
        idFilters: [['line.customerId', query.customerIds]],
      }),
      sumAmountByPeriod(this.expenseLines, {
        ...base,
        idFilters: [['line.vendorId', query.vendorIds]],
      }),
    ]);

    const byPeriod = new Map<string, { revenue: number; spend: number }>();
    for (const row of revenueRows) {
      byPeriod.set(row.period, { revenue: row.totalAmount, spend: 0 });
    }
    for (const row of spendRows) {
      const entry = byPeriod.get(row.period) ?? { revenue: 0, spend: 0 };
      entry.spend = row.totalAmount;
      byPeriod.set(row.period, entry);
    }

    const points = [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, { revenue, spend }]) => ({
        period,
        revenue,
        spend,
        net: Math.round((revenue - spend) * 100) / 100,
      }));

    return { granularity: query.granularity, points };
  }
}
