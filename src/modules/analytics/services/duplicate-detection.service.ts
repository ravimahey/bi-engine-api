import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import { ExpenseTransaction } from '@modules/records/entities';
import { UserRole } from '@modules/users/entities';
import { OrganizationIdQueryDto } from '../dto';
import type { DuplicateTransactionGroupRaw } from '../types';

/**
 * Duplicate invoice detection — FINDINGS_AND_AI_CALCULATION_GUIDE.md §4.2.
 * One `GROUP BY` over the fields that define "the same invoice" (vendor +
 * date + amount), keeping only groups that occur more than once — a single
 * SQL aggregate over every transaction in one round trip, not a per-row
 * loop and not paginated: the result is a handful of duplicate groups, not
 * the transaction list itself. If an explicit invoice/reference-number
 * column is added later, add it to the `GROUP BY` to tighten the match.
 */
@Injectable()
export class DuplicateDetectionService {
  constructor(
    @InjectRepository(ExpenseTransaction)
    private readonly transactions: Repository<ExpenseTransaction>,
  ) {}

  async findPossibleDuplicates(
    query: OrganizationIdQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    this.assertAccess(query.organizationId, currentUser);

    const raw = await this.transactions
      .createQueryBuilder('t')
      .leftJoin('t.vendor', 'vendor')
      .select('t.vendorId', 'vendorId')
      .addSelect('vendor.displayName', 'vendorName')
      .addSelect('t.transactionDate', 'transactionDate')
      .addSelect('t.totalAmount', 'totalAmount')
      .addSelect('COUNT(*)', 'occurrences')
      .addSelect('ARRAY_AGG(t.id)', 'transactionIds')
      .where('t.organizationId = :organizationId', {
        organizationId: query.organizationId,
      })
      .groupBy('t.vendorId')
      .addGroupBy('vendor.displayName')
      .addGroupBy('t.transactionDate')
      .addGroupBy('t.totalAmount')
      .having('COUNT(*) > 1')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('t.totalAmount', 'DESC')
      .getRawMany<DuplicateTransactionGroupRaw>();

    return raw.map((row) => ({
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      transactionDate: row.transactionDate,
      totalAmount: Number(row.totalAmount),
      occurrences: Number(row.occurrences),
      transactionIds: row.transactionIds,
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
