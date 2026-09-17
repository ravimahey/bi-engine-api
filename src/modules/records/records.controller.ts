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
  ExpenseTransactionFilterQueryDto,
  ExpenseTransactionQueryDto,
  OrganizationIdQueryDto,
  TransactionPaymentQueryDto,
  VendorCreditQueryDto,
} from './dto';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
  TransactionPayment,
  VendorCredit,
} from './entities';
import {
  RecordsFilterService,
  RecordsTransactionsQueryService,
} from './services';

/**
 * The public API surface over canonical spend data — category 2 of
 * `QUICKBOOKS_DATA_APIS.md`, what the dashboard, the findings engine, and
 * "Ask Ordaraa" call. Never exposes or depends on QuickBooks-specific
 * fields/types; every response is shaped from the provider-agnostic
 * records/* entities only. `RecordsMasterDataController` covers category 1
 * (master/reference data); `RecordsRevenueController` mirrors this one for
 * category 3 (revenue side).
 */
@ApiTags('Records')
@ApiBearerAuth('access-token')
@Controller('records')
export class RecordsController {
  constructor(
    private readonly recordsFilter: RecordsFilterService,
    private readonly transactionsQuery: RecordsTransactionsQueryService,
  ) {}

  @Get('expense-transactions')
  @ApiOperation({
    summary:
      'List canonical expense-transaction headers (Bill + Purchase, unified via transactionType), filterable by vendor/date/type/source, paginated — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(ExpenseTransaction)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findExpenseTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseTransactionQueryDto,
  ) {
    return this.transactionsQuery.findExpenseTransactions(query, user);
  }

  @Get('expense-transactions/:id')
  @ApiOperation({
    summary:
      'Get a single canonical expense transaction with its line items — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: ExpenseTransaction })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'Expense transaction does not exist' })
  findExpenseTransactionById(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Query() query: OrganizationIdQueryDto,
  ) {
    return this.transactionsQuery.getExpenseTransactionById(id, query, user);
  }

  @Get('expense-transaction-lines')
  @ApiOperation({
    summary:
      'Filter canonical expense-transaction lines by vendor/category/item/date/amount, across every connected provider — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(ExpenseTransactionLine)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findExpenseTransactionLines(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseTransactionFilterQueryDto,
  ) {
    return this.recordsFilter.filter(query, user);
  }

  @Get('vendor-credits')
  @ApiOperation({
    summary:
      'List canonical vendor credits, filterable by vendor/date, paginated — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(VendorCredit)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findVendorCredits(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: VendorCreditQueryDto,
  ) {
    return this.transactionsQuery.findVendorCredits(query, user);
  }

  @Get('transaction-payments')
  @ApiOperation({
    summary:
      'List canonical bill/purchase payments, filterable by vendor/date, paginated — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(TransactionPayment)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findTransactionPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TransactionPaymentQueryDto,
  ) {
    return this.transactionsQuery.findTransactionPayments(query, user);
  }
}
