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
  CustomerPaymentQueryDto,
  OrganizationIdQueryDto,
  SalesTransactionLineQueryDto,
  SalesTransactionQueryDto,
} from './dto';
import {
  CustomerPayment,
  SalesTransaction,
  SalesTransactionLine,
} from './entities';
import {
  RecordsRevenueFilterService,
  RecordsRevenueTransactionsQueryService,
} from './services';

/**
 * The public API surface over canonical revenue data — category 3 of
 * `QUICKBOOKS_DATA_APIS.md`, mirroring `RecordsController` (spend side)
 * exactly. Split into its own controller purely to keep each controller
 * focused on one group of sub-resources, per this repo's file-size guidance.
 * Same auth contract: `@CurrentUser()` + `organizationId` query/path param,
 * non-admins restricted to their own organization.
 */
@ApiTags('Records - Revenue')
@ApiBearerAuth('access-token')
@Controller('records')
export class RecordsRevenueController {
  constructor(
    private readonly revenueTransactionsQuery: RecordsRevenueTransactionsQueryService,
    private readonly revenueFilter: RecordsRevenueFilterService,
  ) {}

  @Get('sales-transactions')
  @ApiOperation({
    summary:
      'List canonical sales-transaction headers (Invoice + SalesReceipt, unified via transactionType), filterable by customer/date/type/source, paginated — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(SalesTransaction)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findSalesTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesTransactionQueryDto,
  ) {
    return this.revenueTransactionsQuery.findSalesTransactions(query, user);
  }

  @Get('sales-transactions/:id')
  @ApiOperation({
    summary:
      'Get a single canonical sales transaction with its line items — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: SalesTransaction })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'Sales transaction does not exist' })
  findSalesTransactionById(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Query() query: OrganizationIdQueryDto,
  ) {
    return this.revenueTransactionsQuery.getSalesTransactionById(
      id,
      query,
      user,
    );
  }

  @Get('sales-transaction-lines')
  @ApiOperation({
    summary:
      'Filter canonical sales-transaction lines by customer/category/item/date/amount, across every connected provider — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(SalesTransactionLine)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findSalesTransactionLines(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesTransactionLineQueryDto,
  ) {
    return this.revenueFilter.filter(query, user);
  }

  @Get('customer-payments')
  @ApiOperation({
    summary:
      'List canonical customer payments, filterable by customer/date, paginated — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(CustomerPayment)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findCustomerPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerPaymentQueryDto,
  ) {
    return this.revenueTransactionsQuery.findCustomerPayments(query, user);
  }
}
