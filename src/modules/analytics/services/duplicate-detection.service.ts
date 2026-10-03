import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import { ExpenseTransaction } from '@modules/records/entities';
import { UserRole } from '@modules/users/entities';
import { OrganizationIdQueryDto } from '../dto';
import type {
  DuplicateGroupWithCurrency,
  DuplicateTransactionGroupRaw,
} from '../types';

/**
 * The pg driver hands `date` columns back as a JS `Date` at local midnight
 * (despite the `string` type), which serialises to a timezone-shifted ISO
 * timestamp. Normalise to the plain `YYYY-MM-DD` calendar date.
 */
function toDateOnly(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

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

    const raw = await this.queryGroups(query.organizationId);
    return raw.map((row) => this.toGroup(row));
  }

  /**
   * The same groups for an in-process caller with no user to authorize —
   * the post-sync signal producer (`FindingSignalsService`). Adds the
   * group's `currency`, which a signal's message needs to quote the amount.
   */
  async findGroupsForOrganization(
    organizationId: string,
  ): Promise<DuplicateGroupWithCurrency[]> {
    const raw = await this.queryGroups(organizationId);
    return raw.map((row) => ({
      ...this.toGroup(row),
      currency: row.currency,
    }));
  }

  private queryGroups(
    organizationId: string,
  ): Promise<DuplicateTransactionGroupRaw[]> {
    return this.transactions
      .createQueryBuilder('t')
      .leftJoin('t.vendor', 'vendor')
      .select('t.vendorId', 'vendorId')
      .addSelect('vendor.displayName', 'vendorName')
      .addSelect('t.transactionDate', 'transactionDate')
      .addSelect('t.totalAmount', 'totalAmount')
      .addSelect('MIN(t.currency)', 'currency')
      .addSelect('COUNT(*)', 'occurrences')
      .addSelect('ARRAY_AGG(t.id)', 'transactionIds')
      .where('t.organizationId = :organizationId', { organizationId })
      .groupBy('t.vendorId')
      .addGroupBy('vendor.displayName')
      .addGroupBy('t.transactionDate')
      .addGroupBy('t.totalAmount')
      .having('COUNT(*) > 1')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('t.totalAmount', 'DESC')
      .getRawMany<DuplicateTransactionGroupRaw>();
  }

  private toGroup(row: DuplicateTransactionGroupRaw) {
    return {
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      transactionDate: toDateOnly(row.transactionDate),
      totalAmount: Number(row.totalAmount),
      occurrences: Number(row.occurrences),
      transactionIds: row.transactionIds,
    };
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
