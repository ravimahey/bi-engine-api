import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository, type FindOptionsWhere } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization, paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { UserRole } from '@modules/users/entities';
import {
  ItemQueryDto,
  OrganizationIdQueryDto,
  SpendCategoryQueryDto,
  TaxCodeQueryDto,
  TaxRateQueryDto,
  VendorQueryDto,
} from '../dto';
import {
  CompanyProfile,
  Item,
  SpendCategory,
  TaxCode,
  TaxRate,
  Vendor,
} from '../entities';

/**
 * Read-only master/reference-data lookups — spend-side sibling of
 * `RecordsService` (which owns the writes into these same tables), split out
 * purely because writes and reads are different concerns/callers (a provider
 * mapper vs. the frontend). `RecordsRevenueQueryService` is the revenue-side
 * mirror, covering `Customer`. Every list here is small and joinless per the
 * build-order guide — a plain `findAndCount` is enough, no `QueryBuilder`.
 */
@Injectable()
export class RecordsQueryService {
  constructor(
    @InjectRepository(CompanyProfile)
    private readonly companyProfiles: Repository<CompanyProfile>,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
    @InjectRepository(SpendCategory)
    private readonly categories: Repository<SpendCategory>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    @InjectRepository(TaxRate)
    private readonly taxRates: Repository<TaxRate>,
    @InjectRepository(TaxCode)
    private readonly taxCodes: Repository<TaxCode>,
  ) {}

  async getCompanyProfile(
    query: OrganizationIdQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<CompanyProfile> {
    this.assertAccess(currentUser, query.organizationId);

    const profile = await this.companyProfiles.findOne({
      where: { organizationId: query.organizationId },
    });

    if (!profile) {
      throw new NotFoundException(
        `No company profile has been synced yet for organization "${query.organizationId}"`,
      );
    }

    return profile;
  }

  async getVendors(
    query: VendorQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<Vendor>> {
    this.assertAccess(currentUser, query.organizationId);

    const where: FindOptionsWhere<Vendor> = {
      organizationId: query.organizationId,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search ? { displayName: ILike(`%${query.search}%`) } : {}),
    };

    const result = await this.vendors.findAndCount({
      where,
      order: { [query.sortBy]: query.order },
      skip: query.skip,
      take: query.limit,
    });

    return paginate(result, query.page, query.limit);
  }

  async getVendorById(
    id: string,
    query: OrganizationIdQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Vendor> {
    this.assertAccess(currentUser, query.organizationId);

    const vendor = await this.vendors.findOne({
      where: { id, organizationId: query.organizationId },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor with id "${id}" was not found`);
    }

    return vendor;
  }

  async getCategories(
    query: SpendCategoryQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<SpendCategory>> {
    this.assertAccess(currentUser, query.organizationId);

    const where: FindOptionsWhere<SpendCategory> = {
      organizationId: query.organizationId,
      ...(query.parentCategoryId === undefined
        ? {}
        : { parentCategoryId: query.parentCategoryId }),
      ...(query.search ? { name: ILike(`%${query.search}%`) } : {}),
    };

    const result = await this.categories.findAndCount({
      where,
      order: { [query.sortBy]: query.order },
      skip: query.skip,
      take: query.limit,
    });

    return paginate(result, query.page, query.limit);
  }

  async getItems(
    query: ItemQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<Item>> {
    this.assertAccess(currentUser, query.organizationId);

    const where: FindOptionsWhere<Item> = {
      organizationId: query.organizationId,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search ? { name: ILike(`%${query.search}%`) } : {}),
    };

    const result = await this.items.findAndCount({
      where,
      order: { [query.sortBy]: query.order },
      skip: query.skip,
      take: query.limit,
    });

    return paginate(result, query.page, query.limit);
  }

  async getTaxRates(
    query: TaxRateQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<TaxRate>> {
    this.assertAccess(currentUser, query.organizationId);

    const where: FindOptionsWhere<TaxRate> = {
      organizationId: query.organizationId,
      ...(query.search ? { name: ILike(`%${query.search}%`) } : {}),
    };

    const result = await this.taxRates.findAndCount({
      where,
      order: { [query.sortBy]: query.order },
      skip: query.skip,
      take: query.limit,
    });

    return paginate(result, query.page, query.limit);
  }

  /** `TaxCode.primaryPurchaseTaxRateId`/`primarySalesTaxRateId` are already resolved columns — no join needed to include them. */
  async getTaxCodes(
    query: TaxCodeQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Paginated<TaxCode>> {
    this.assertAccess(currentUser, query.organizationId);

    const where: FindOptionsWhere<TaxCode> = {
      organizationId: query.organizationId,
      ...(query.search ? { name: ILike(`%${query.search}%`) } : {}),
    };

    const result = await this.taxCodes.findAndCount({
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
