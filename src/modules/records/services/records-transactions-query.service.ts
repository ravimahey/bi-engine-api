import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository, type FindOptionsWhere } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization, paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { UserRole } from '@modules/users/entities';
import {
  ExpenseTransactionQueryDto,
  OrganizationIdQueryDto,
  TransactionPaymentQueryDto,
  VendorCreditQueryDto,
} from '../dto';
import {
  ExpenseTransaction,
  TransactionPayment,
  VendorCredit,
} from '../entities';
import { dateRangeFilter } from '../utils';

/**
 * Read-only spend-transaction lookups — category 2 of
 * `QUICKBOOKS_DATA_APIS.md`, minus `expense-transaction-lines` (already
 * covered by `RecordsFilterService`'s composable QueryBuilder). None of
 * these filters need a join, so a plain `findAndCount`/`findOne` over
 * `FindOptionsWhere` is enough — no `QueryBuilder`. Split out from
 * `RecordsQueryService` (master/reference data) purely to keep each file
 * within this repo's size guidance.
 */
@Injectable()
export class RecordsTransactionsQueryService {
  constructor(
    @InjectRepository(ExpenseTransaction)
    private readonly expenseTransactions: Repository<ExpenseTransaction>,
    @InjectRepository(VendorCredit)
    private readonly vendorCredits: Repository<VendorCredit>,
    @InjectRepository(TransactionPayment)
    private readonly transactionPayments: Repository<TransactionPayment>,
  ) {}

  async findExpenseTransactions(
    query: ExpenseTransactionQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<ExpenseTransaction>> {
    this.assertAccess(currentUser, query.organizationId);

    const dateRange = dateRangeFilter(query.dateFrom, query.dateTo);
    const where: FindOptionsWhere<ExpenseTransaction> = {
      organizationId: query.organizationId,
      ...(dateRange ? { transactionDate: dateRange } : {}),
      ...(query.vendorIds?.length ? { vendorId: In(query.vendorIds) } : {}),
      ...(query.sourceSystem ? { sourceSystem: query.sourceSystem } : {}),
      ...(query.transactionType
        ? { transactionType: query.transactionType }
        : {}),
      ...(query.search ? { privateNote: ILike(`%${query.search}%`) } : {}),
    };

    const result = await this.expenseTransactions.findAndCount({
      where,
      order: { [query.sortBy]: query.order },
      skip: query.skip,
      take: query.limit,
    });

    return paginate(result, query.page, query.limit);
  }

  /** Header + its full `ExpenseTransactionLine[]`, per the doc's detail-view spec. */
  async getExpenseTransactionById(
    id: string,
    query: OrganizationIdQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<ExpenseTransaction> {
    this.assertAccess(currentUser, query.organizationId);

    const transaction = await this.expenseTransactions.findOne({
      where: { id, organizationId: query.organizationId },
      relations: { lines: true },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Expense transaction with id "${id}" was not found`,
      );
    }

    return transaction;
  }

  async findVendorCredits(
    query: VendorCreditQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<VendorCredit>> {
    this.assertAccess(currentUser, query.organizationId);

    const dateRange = dateRangeFilter(query.dateFrom, query.dateTo);
    const where: FindOptionsWhere<VendorCredit> = {
      organizationId: query.organizationId,
      ...(dateRange ? { transactionDate: dateRange } : {}),
      ...(query.vendorIds?.length ? { vendorId: In(query.vendorIds) } : {}),
      ...(query.sourceSystem ? { sourceSystem: query.sourceSystem } : {}),
    };

    const result = await this.vendorCredits.findAndCount({
      where,
      order: { [query.sortBy]: query.order },
      skip: query.skip,
      take: query.limit,
    });

    return paginate(result, query.page, query.limit);
  }

  async findTransactionPayments(
    query: TransactionPaymentQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<TransactionPayment>> {
    this.assertAccess(currentUser, query.organizationId);

    const dateRange = dateRangeFilter(query.dateFrom, query.dateTo);
    const where: FindOptionsWhere<TransactionPayment> = {
      organizationId: query.organizationId,
      ...(dateRange ? { paymentDate: dateRange } : {}),
      ...(query.vendorIds?.length ? { vendorId: In(query.vendorIds) } : {}),
      ...(query.sourceSystem ? { sourceSystem: query.sourceSystem } : {}),
    };

    const result = await this.transactionPayments.findAndCount({
      where,
      order: { [query.sortBy]: query.order },
      skip: query.skip,
      take: query.limit,
    });

    return paginate(result, query.page, query.limit);
  }

  private assertAccess(
    currentUser: AuthenticatedUser,
    organizationId: string,
  ): void {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(currentUser.organizationId, organizationId);
    }
  }
}
