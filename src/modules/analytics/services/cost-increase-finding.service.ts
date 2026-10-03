import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import { ExpenseTransactionLine } from '@modules/records/entities';
import { UserRole } from '@modules/users/entities';
import {
  QTY_STABLE_THRESHOLD_PERCENT,
  SPEND_CHANGE_FINDING_THRESHOLD_PERCENT,
} from '../constants';
import {
  CategorySpendChangeQueryDto,
  SupplierSpendChangeQueryDto,
} from '../dto';
import type { SpendChangeDriver, SpendPeriod, SpendPeriodRaw } from '../types';

/**
 * Money-leak findings (category/supplier cost increase) —
 * FINDINGS_AND_AI_CALCULATION_GUIDE.md §4.3. Same aggregate query, run
 * twice for two date windows, then compared — still one SQL pass per
 * window, no per-row loop. `quantity` is pulled alongside `amount` so the
 * increase can be classified price- vs volume-driven, per the "don't call
 * volume growth a savings opportunity" rule (E2E-02).
 */
@Injectable()
export class CostIncreaseFindingService {
  constructor(
    @InjectRepository(ExpenseTransactionLine)
    private readonly lines: Repository<ExpenseTransactionLine>,
  ) {}

  async getSupplierSpendChange(
    query: SupplierSpendChangeQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    this.assertAccess(query.organizationId, currentUser);

    const [current, prior] = await Promise.all([
      this.sumSpendAndQty(
        query.organizationId,
        'vendorId',
        query.vendorId,
        query.currentFrom,
        query.currentTo,
      ),
      this.sumSpendAndQty(
        query.organizationId,
        'vendorId',
        query.vendorId,
        query.priorFrom,
        query.priorTo,
      ),
    ]);

    return this.buildSpendChange(current, prior);
  }

  async getCategorySpendChange(
    query: CategorySpendChangeQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    this.assertAccess(query.organizationId, currentUser);

    const [current, prior] = await Promise.all([
      this.sumSpendAndQty(
        query.organizationId,
        'categoryId',
        query.categoryId,
        query.currentFrom,
        query.currentTo,
      ),
      this.sumSpendAndQty(
        query.organizationId,
        'categoryId',
        query.categoryId,
        query.priorFrom,
        query.priorTo,
      ),
    ]);

    return this.buildSpendChange(current, prior);
  }

  /**
   * `matchColumn` is a fixed internal literal (`'vendorId' | 'categoryId'`),
   * never caller-supplied, so interpolating it into the query fragment
   * carries no injection risk — the column name itself can't be attacker
   * data, only the parameterized `matchValue` can.
   */
  private async sumSpendAndQty(
    organizationId: string,
    matchColumn: 'vendorId' | 'categoryId',
    matchValue: string,
    from: string,
    to: string,
  ): Promise<SpendPeriod> {
    const raw = await this.lines
      .createQueryBuilder('line')
      .select('COALESCE(SUM(line.amount), 0)', 'totalSpend')
      .addSelect('COALESCE(SUM(line.quantity), 0)', 'totalQty')
      .where('line.organizationId = :organizationId', { organizationId })
      .andWhere(`line.${matchColumn} = :matchValue`, { matchValue })
      .andWhere('line.transactionDate BETWEEN :from AND :to', { from, to })
      .getRawOne<SpendPeriodRaw>();

    return {
      totalSpend: Number(raw?.totalSpend ?? 0),
      totalQty: Number(raw?.totalQty ?? 0),
    };
  }

  /** The comparison itself — public so the category scan classifies a change exactly as these endpoints do. */
  buildSpendChange(current: SpendPeriod, prior: SpendPeriod) {
    const spendChange = current.totalSpend - prior.totalSpend;
    const spendChangePercent =
      prior.totalSpend > 0 ? (spendChange / prior.totalSpend) * 100 : null;

    const qtyChange = current.totalQty - prior.totalQty;
    const qtyChangePercent =
      prior.totalQty > 0 ? (qtyChange / prior.totalQty) * 100 : null;

    const driver = this.classifyDriver(
      spendChange,
      spendChangePercent,
      qtyChangePercent,
    );
    const isFinding =
      spendChange > 0 &&
      spendChangePercent !== null &&
      spendChangePercent >= SPEND_CHANGE_FINDING_THRESHOLD_PERCENT;

    return {
      current,
      prior,
      spendChange,
      spendChangePercent,
      qtyChange,
      qtyChangePercent,
      driver,
      isFinding,
    };
  }

  private classifyDriver(
    spendChange: number,
    spendChangePercent: number | null,
    qtyChangePercent: number | null,
  ): SpendChangeDriver {
    if (spendChange <= 0) return 'none';
    if (spendChangePercent === null || qtyChangePercent === null) {
      return 'unknown';
    }

    if (Math.abs(qtyChangePercent) <= QTY_STABLE_THRESHOLD_PERCENT) {
      return 'price';
    }

    if (
      Math.abs(qtyChangePercent - spendChangePercent) <=
      QTY_STABLE_THRESHOLD_PERCENT
    ) {
      return 'volume';
    }

    return 'mixed';
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
