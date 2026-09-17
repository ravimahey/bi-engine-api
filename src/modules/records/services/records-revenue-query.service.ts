import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository, type FindOptionsWhere } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization, paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { UserRole } from '@modules/users/entities';
import { CustomerQueryDto, OrganizationIdQueryDto } from '../dto';
import { Customer } from '../entities';

/**
 * Read-only revenue-side master-data lookups — mirrors `RecordsQueryService`
 * (spend side + shared master data), sibling of `RecordsRevenueService`
 * (which owns the writes into `Customer`). Split out purely to keep each
 * file within this repo's size guidance and to mirror the existing
 * write-side service split.
 */
@Injectable()
export class RecordsRevenueQueryService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async findCustomers(
    query: CustomerQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<Customer>> {
    this.assertAccess(currentUser, query.organizationId);

    const where: FindOptionsWhere<Customer> = {
      organizationId: query.organizationId,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search ? { displayName: ILike(`%${query.search}%`) } : {}),
    };

    const result = await this.customers.findAndCount({
      where,
      order: { [query.sortBy]: query.order },
      skip: query.skip,
      take: query.limit,
    });

    return paginate(result, query.page, query.limit);
  }

  async findCustomerById(
    id: string,
    query: OrganizationIdQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Customer> {
    this.assertAccess(currentUser, query.organizationId);

    const customer = await this.customers.findOne({
      where: { id, organizationId: query.organizationId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with id "${id}" was not found`);
    }

    return customer;
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
