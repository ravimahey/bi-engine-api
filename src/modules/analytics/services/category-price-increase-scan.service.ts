import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpenseTransactionLine } from '@modules/records/entities';
import type {
  CategoryPriceIncrease,
  CategorySpendWindowsRaw,
  SpendChangeWindows,
} from '../types';
import { CostIncreaseFindingService } from './cost-increase-finding.service';

const IN_CURRENT = 'line.transactionDate BETWEEN :currentFrom AND :currentTo';
const IN_PRIOR = 'line.transactionDate BETWEEN :priorFrom AND :priorTo';
const sumWhen = (window: string, column: string): string =>
  `COALESCE(SUM(CASE WHEN ${window} THEN line.${column} ELSE 0 END), 0)`;

/**
 * Finds every category with a price-driven cost increase in one pass —
 * FINDINGS_AND_AI_CALCULATION_GUIDE.md §4.3 applied to all categories at
 * once, instead of the one-category-at-a-time `cost-increase/category`
 * endpoint. One `GROUP BY category` aggregate over both windows in
 * Postgres; each row is then classified by the very same
 * `CostIncreaseFindingService.buildSpendChange`, so "is this a finding, and
 * is it price-driven?" has exactly one definition.
 */
@Injectable()
export class CategoryPriceIncreaseScanService {
  constructor(
    @InjectRepository(ExpenseTransactionLine)
    private readonly lines: Repository<ExpenseTransactionLine>,
    private readonly costIncreaseFinding: CostIncreaseFindingService,
  ) {}

  async findPriceIncreases(
    organizationId: string,
    windows: SpendChangeWindows,
  ): Promise<CategoryPriceIncrease[]> {
    const raw = await this.lines
      .createQueryBuilder('line')
      .innerJoin('line.category', 'category')
      .select('line.categoryId', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect(sumWhen(IN_CURRENT, 'amount'), 'currentSpend')
      .addSelect(sumWhen(IN_CURRENT, 'quantity'), 'currentQty')
      .addSelect(sumWhen(IN_PRIOR, 'amount'), 'priorSpend')
      .addSelect(sumWhen(IN_PRIOR, 'quantity'), 'priorQty')
      .where('line.organizationId = :organizationId')
      .andWhere(`(${IN_CURRENT} OR ${IN_PRIOR})`)
      .groupBy('line.categoryId')
      .addGroupBy('category.name')
      // Cheap pre-filter: only categories whose spend rose at all.
      .having(
        `${sumWhen(IN_CURRENT, 'amount')} > ${sumWhen(IN_PRIOR, 'amount')}`,
      )
      .setParameters({ organizationId, ...windows })
      .getRawMany<CategorySpendWindowsRaw>();

    const increases: CategoryPriceIncrease[] = [];
    for (const row of raw) {
      const change = this.costIncreaseFinding.buildSpendChange(
        {
          totalSpend: Number(row.currentSpend),
          totalQty: Number(row.currentQty),
        },
        { totalSpend: Number(row.priorSpend), totalQty: Number(row.priorQty) },
      );

      if (
        change.isFinding &&
        change.driver === 'price' &&
        change.spendChangePercent !== null
      ) {
        increases.push({
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          spendChangePercent: change.spendChangePercent,
        });
      }
    }
    return increases;
  }
}
