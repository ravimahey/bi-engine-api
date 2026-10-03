import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization, paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { ExpenseTransaction } from '@modules/records/entities';
import { UserRole } from '@modules/users/entities';
import { DataQualityIssuesQueryDto, OrganizationIdQueryDto } from '../dto';

/**
 * Missing/wrong transaction detection (data quality) —
 * FINDINGS_AND_AI_CALCULATION_GUIDE.md §4.4. A "wrong" transaction is one
 * with no vendor or a non-positive total — `transactionDate IS NULL` from
 * the guide's own example is left out here since that column is `NOT NULL`
 * in the schema and can never be true. One unpaginated `COUNT` for the
 * dashboard badge, one paginated `getManyAndCount` for the "review these"
 * screen — siblings sharing the same filter, never the same query reused
 * twice for two purposes.
 */
@Injectable()
export class DataQualityService {
  constructor(
    @InjectRepository(ExpenseTransaction)
    private readonly transactions: Repository<ExpenseTransaction>,
  ) {}

  async countIssues(
    query: OrganizationIdQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<{ count: number }> {
    this.assertAccess(query.organizationId, currentUser);

    const count = await this.issuesQuery(query.organizationId).getCount();
    return { count };
  }

  async listIssues(
    query: DataQualityIssuesQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<ExpenseTransaction>> {
    this.assertAccess(query.organizationId, currentUser);

    const [items, total] = await this.issuesQuery(query.organizationId)
      .orderBy('t.transactionDate', query.order)
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return paginate([items, total], query.page, query.limit);
  }

  /**
   * Transactions dated inside `[from, to]` with no supplier assigned — the
   * fact behind the data-quality signal. No caller to authorize: this is
   * for the in-process signal producer, never exposed over HTTP.
   */
  countMissingSupplier(
    organizationId: string,
    from: string,
    to: string,
  ): Promise<number> {
    return this.transactions
      .createQueryBuilder('t')
      .where('t.organizationId = :organizationId', { organizationId })
      .andWhere('t.vendorId IS NULL')
      .andWhere('t.transactionDate BETWEEN :from AND :to', { from, to })
      .getCount();
  }

  private issuesQuery(
    organizationId: string,
  ): SelectQueryBuilder<ExpenseTransaction> {
    return this.transactions
      .createQueryBuilder('t')
      .where('t.organizationId = :organizationId', { organizationId })
      .andWhere(
        new Brackets((qb) => {
          qb.where('t.vendorId IS NULL').orWhere('t.totalAmount <= 0');
        }),
      );
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
