import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository, type FindOptionsWhere } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization, paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { UserRole } from '@modules/users/entities';
import {
  CustomerPaymentQueryDto,
  OrganizationIdQueryDto,
  SalesTransactionQueryDto,
} from '../dto';
import { CustomerPayment, SalesTransaction } from '../entities';
import { dateRangeFilter } from '../utils';

/**
 * Read-only sales-transaction lookups — category 3 of
 * `QUICKBOOKS_DATA_APIS.md`, minus `sales-transaction-lines` (covered by
 * `RecordsRevenueFilterService`'s composable QueryBuilder). Revenue-side
 * mirror of `RecordsTransactionsQueryService`, same
 * `FindOptionsWhere`-over-`findAndCount` reasoning (no joins needed).
 */
@Injectable()
export class RecordsRevenueTransactionsQueryService {
  constructor(
    @InjectRepository(SalesTransaction)
    private readonly salesTransactions: Repository<SalesTransaction>,
    @InjectRepository(CustomerPayment)
    private readonly customerPayments: Repository<CustomerPayment>,
  ) {}

  async findSalesTransactions(
    query: SalesTransactionQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<SalesTransaction>> {
    this.assertAccess(currentUser, query.organizationId);

    const dateRange = dateRangeFilter(query.dateFrom, query.dateTo);
    const where: FindOptionsWhere<SalesTransaction> = {
      organizationId: query.organizationId,
      ...(dateRange ? { transactionDate: dateRange } : {}),
      ...(query.customerIds?.length
        ? { customerId: In(query.customerIds) }
        : {}),
      ...(query.sourceSystem ? { sourceSystem: query.sourceSystem } : {}),
      ...(query.transactionType
        ? { transactionType: query.transactionType }
        : {}),
      ...(query.search ? { privateNote: ILike(`%${query.search}%`) } : {}),
    };

    const result = await this.salesTransactions.findAndCount({
      where,
      order: { [query.sortBy]: query.order },
      skip: query.skip,
      take: query.limit,
    });

    return paginate(result, query.page, query.limit);
  }

  /** Header + its full `SalesTransactionLine[]`, per the doc's detail-view spec. */
  async getSalesTransactionById(
    id: string,
    query: OrganizationIdQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<SalesTransaction> {
    this.assertAccess(currentUser, query.organizationId);

    const transaction = await this.salesTransactions.findOne({
      where: { id, organizationId: query.organizationId },
      relations: { lines: true },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Sales transaction with id "${id}" was not found`,
      );
    }

    return transaction;
  }

  async findCustomerPayments(
    query: CustomerPaymentQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<CustomerPayment>> {
    this.assertAccess(currentUser, query.organizationId);

    const dateRange = dateRangeFilter(query.dateFrom, query.dateTo);
    const where: FindOptionsWhere<CustomerPayment> = {
      organizationId: query.organizationId,
      ...(dateRange ? { paymentDate: dateRange } : {}),
      ...(query.customerIds?.length
        ? { customerId: In(query.customerIds) }
        : {}),
      ...(query.sourceSystem ? { sourceSystem: query.sourceSystem } : {}),
    };

    const result = await this.customerPayments.findAndCount({
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
