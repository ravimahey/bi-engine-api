import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse, CurrentUser } from '@common/decorators';
import type { AuthenticatedUser } from '@common/decorators';
import { IdParamDto } from '@common/dto';
import {
  CustomerQueryDto,
  ItemQueryDto,
  OrganizationIdQueryDto,
  SpendCategoryQueryDto,
  TaxCodeQueryDto,
  TaxRateQueryDto,
  VendorQueryDto,
} from './dto';
import {
  CompanyProfile,
  Customer,
  Item,
  SpendCategory,
  TaxCode,
  TaxRate,
  Vendor,
} from './entities';
import { RecordsQueryService, RecordsRevenueQueryService } from './services';

/**
 * Read-only master/reference data over the canonical `records/*` schema —
 * category 1 of `QUICKBOOKS_DATA_APIS.md`. Mostly used to populate
 * dropdowns/filters elsewhere, but each list also stands on its own screen.
 * Split out from `RecordsController` (which owns the transaction-line/
 * header endpoints) purely to keep each controller focused on one group of
 * sub-resources, per this repo's file-size guidance. Same auth contract as
 * `RecordsController`: `@CurrentUser()` + `organizationId` query param,
 * non-admins restricted to their own organization.
 */
@ApiTags('Records - Master Data')
@ApiBearerAuth('access-token')
@Controller('records')
export class RecordsMasterDataController {
  constructor(
    private readonly recordsQuery: RecordsQueryService,
    private readonly recordsRevenueQuery: RecordsRevenueQueryService,
  ) {}

  @Get('vendors')
  @ApiOperation({
    summary:
      'List canonical vendors, filterable by search/isActive, paginated — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(Vendor)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findVendors(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: VendorQueryDto,
  ) {
    return this.recordsQuery.getVendors(query, user);
  }

  @Get('vendors/:id')
  @ApiOperation({
    summary:
      'Get a single canonical vendor — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: Vendor })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'Vendor does not exist' })
  findVendorById(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Query() query: OrganizationIdQueryDto,
  ) {
    return this.recordsQuery.getVendorById(id, query, user);
  }

  @Get('categories')
  @ApiOperation({
    summary:
      "List canonical spend categories (chart-of-accounts), paginated — flat with each row's own parentCategoryId for the frontend to nest, optionally narrowed to one parent's direct children — must be your own organization, unless admin",
  })
  @ApiPaginatedResponse(SpendCategory)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SpendCategoryQueryDto,
  ) {
    return this.recordsQuery.getCategories(query, user);
  }

  @Get('items')
  @ApiOperation({
    summary:
      'List canonical products/services, filterable by search/isActive, paginated — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(Item)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findItems(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ItemQueryDto,
  ) {
    return this.recordsQuery.getItems(query, user);
  }

  @Get('tax-rates')
  @ApiOperation({
    summary:
      'List canonical tax rates, paginated — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(TaxRate)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findTaxRates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TaxRateQueryDto,
  ) {
    return this.recordsQuery.getTaxRates(query, user);
  }

  @Get('tax-codes')
  @ApiOperation({
    summary:
      'List canonical tax codes, paginated, each already carrying its resolved primaryPurchaseTaxRateId/primarySalesTaxRateId — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(TaxCode)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findTaxCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TaxCodeQueryDto,
  ) {
    return this.recordsQuery.getTaxCodes(query, user);
  }

  @Get('customers')
  @ApiOperation({
    summary:
      'List canonical customers, filterable by search/isActive, paginated — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(Customer)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerQueryDto,
  ) {
    return this.recordsRevenueQuery.findCustomers(query, user);
  }

  @Get('customers/:id')
  @ApiOperation({
    summary:
      'Get a single canonical customer — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: Customer })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'Customer does not exist' })
  findCustomerById(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Query() query: OrganizationIdQueryDto,
  ) {
    return this.recordsRevenueQuery.findCustomerById(id, query, user);
  }

  @Get('company-profile')
  @ApiOperation({
    summary:
      'Get the synced company profile (singleton per organization) — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: CompanyProfile })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'No company profile synced yet' })
  findCompanyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrganizationIdQueryDto,
  ) {
    return this.recordsQuery.getCompanyProfile(query, user);
  }
}
