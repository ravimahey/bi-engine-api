import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { ExpenseTransactionLine } from '@modules/records/entities';
import type {
  SupplierIncreaseRaw,
  SupplierIncreaseRow,
  TopSupplierIncreaseParams,
} from '../types';
import { assertCanAccessOrganization, round1, round2 } from '../utils';

const IN_CURRENT = 'line.transactionDate BETWEEN :currentFrom AND :currentTo';
const IN_PRIOR = 'line.transactionDate BETWEEN :priorFrom AND :priorTo';
const CURRENT_SUM = `SUM(CASE WHEN ${IN_CURRENT} THEN line.amount ELSE 0 END)`;
const PRIOR_SUM = `SUM(CASE WHEN ${IN_PRIOR} THEN line.amount ELSE 0 END)`;

/**
 * The deterministic ranking behind "which supplier had the biggest spend
 * increase?" (LANGCHAIN_INTEGRATION_GUIDE.md §3.6). One `GROUP BY vendor`
 * aggregate over both windows in Postgres - the model never loops over
 * suppliers. Only suppliers whose spend actually rose are returned, biggest
 * absolute increase first; lines with no supplier can't be ranked and are
 * left out.
 */
@Injectable()
export class TopSupplierIncreasesService {
  constructor(
    @InjectRepository(ExpenseTransactionLine)
    private readonly lines: Repository<ExpenseTransactionLine>,
  ) {}

  async findTop(
    params: TopSupplierIncreaseParams,
    currentUser: AuthenticatedUser,
  ): Promise<SupplierIncreaseRow[]> {
    assertCanAccessOrganization(currentUser, params.organizationId);

    const raw = await this.lines
      .createQueryBuilder('line')
      .innerJoin('line.vendor', 'vendor')
      .select('vendor.displayName', 'vendorName')
      .addSelect(`COALESCE(${CURRENT_SUM}, 0)`, 'currentSpend')
      .addSelect(`COALESCE(${PRIOR_SUM}, 0)`, 'priorSpend')
      .where('line.organizationId = :organizationId')
      .andWhere(`(${IN_CURRENT} OR ${IN_PRIOR})`)
      .groupBy('line.vendorId')
      .addGroupBy('vendor.displayName')
      .having(`${CURRENT_SUM} > ${PRIOR_SUM}`)
      .orderBy(`${CURRENT_SUM} - ${PRIOR_SUM}`, 'DESC')
      .limit(params.limit)
      .setParameters({
        organizationId: params.organizationId,
        currentFrom: params.currentFrom,
        currentTo: params.currentTo,
        priorFrom: params.priorFrom,
        priorTo: params.priorTo,
      })
      .getRawMany<SupplierIncreaseRaw>();

    return raw.map((row) => {
      const currentSpend = Number(row.currentSpend);
      const priorSpend = Number(row.priorSpend);
      const change = round2(currentSpend - priorSpend);
      return {
        supplierName: row.vendorName,
        currentSpend: round2(currentSpend),
        priorSpend: round2(priorSpend),
        change,
        changePercent:
          priorSpend > 0 ? round1((change / priorSpend) * 100) : null,
      };
    });
  }
}
