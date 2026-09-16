import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization, paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { UserRole } from '@modules/users/entities';
import { ExpenseTransactionFilterQueryDto } from '../dto';
import { ExpenseTransactionLine } from '../entities';

/**
 * Builds the composable filter over `ExpenseTransactionLine` via
 * QueryBuilder — the line grain is where every filter dimension (vendor,
 * category, item, tax rate, amount) actually lives, so this is the single
 * join (line -> its parent transaction, for transaction_type/source_system)
 * the dashboard, findings engine, and later "Ask Ordaraa" all reuse instead
 * of each hand-rolling their own query.
 */
@Injectable()
export class RecordsFilterService {
  constructor(
    @InjectRepository(ExpenseTransactionLine)
    private readonly lines: Repository<ExpenseTransactionLine>,
  ) {}

  async filter(
    query: ExpenseTransactionFilterQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<ExpenseTransactionLine>> {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(currentUser.organizationId, query.organizationId);
    }

    const [items, total] = await this.buildQuery(query)
      .orderBy(`line.${query.sortBy}`, query.order)
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return paginate([items, total], query.page, query.limit);
  }

  private buildQuery(
    query: ExpenseTransactionFilterQueryDto,
  ): SelectQueryBuilder<ExpenseTransactionLine> {
    const qb = this.lines
      .createQueryBuilder('line')
      .leftJoinAndSelect('line.vendor', 'vendor')
      .leftJoinAndSelect('line.category', 'category')
      .leftJoinAndSelect('line.item', 'item')
      .leftJoinAndSelect('line.taxRate', 'taxRate')
      .innerJoin('line.transaction', 'transaction')
      .where('line.organizationId = :organizationId', {
        organizationId: query.organizationId,
      });

    if (query.dateFrom) {
      qb.andWhere('line.transactionDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    }

    if (query.dateTo) {
      qb.andWhere('line.transactionDate <= :dateTo', { dateTo: query.dateTo });
    }

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

    if (query.itemIds?.length) {
      qb.andWhere('line.itemId IN (:...itemIds)', { itemIds: query.itemIds });
    }

    if (query.taxRateIds?.length) {
      qb.andWhere('line.taxRateId IN (:...taxRateIds)', {
        taxRateIds: query.taxRateIds,
      });
    }

    if (query.amountMin !== undefined) {
      qb.andWhere('line.amount >= :amountMin', { amountMin: query.amountMin });
    }

    if (query.amountMax !== undefined) {
      qb.andWhere('line.amount <= :amountMax', { amountMax: query.amountMax });
    }

    if (query.transactionType) {
      qb.andWhere('transaction.transactionType = :transactionType', {
        transactionType: query.transactionType,
      });
    }

    if (query.sourceSystem) {
      qb.andWhere('transaction.sourceSystem = :sourceSystem', {
        sourceSystem: query.sourceSystem,
      });
    }

    if (query.search) {
      qb.andWhere('line.description ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    return qb;
  }
}
