import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse, CurrentUser } from '@common/decorators';
import type { AuthenticatedUser } from '@common/decorators';
import { ExpenseTransaction } from '@modules/records/entities';
import {
  CategorySpendChangeQueryDto,
  CategorySpendDto,
  DataQualityIssueCountDto,
  DataQualityIssuesQueryDto,
  DuplicateTransactionGroupDto,
  ExpenseSummaryQueryDto,
  OrganizationIdQueryDto,
  SpendChangeDto,
  SupplierSpendChangeQueryDto,
  TotalSpendDto,
} from './dto';
import {
  CostIncreaseFindingService,
  DataQualityService,
  DuplicateDetectionService,
  ExpenseSummaryService,
} from './services';

/**
 * KPI/dashboard aggregates and findings — thin by design: DTO validation
 * (global pipe) → one service call → return. Every number/group here comes
 * from a single SQL aggregate query run over the whole matching row set in
 * Postgres, never from paginating and summing/scanning in application code.
 */
@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly expenseSummary: ExpenseSummaryService,
    private readonly duplicateDetection: DuplicateDetectionService,
    private readonly costIncreaseFinding: CostIncreaseFindingService,
    private readonly dataQuality: DataQualityService,
  ) {}

  @Get('expense-summary/total')
  @ApiOperation({
    summary:
      'Total spend and line count for an organization over a date range — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: TotalSpendDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getTotalSpend(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseSummaryQueryDto,
  ) {
    return this.expenseSummary.getTotalSpend(query, user);
  }

  @Get('expense-summary/per-category')
  @ApiOperation({
    summary:
      'Spend broken down by category for an organization over a date range, sorted by spend descending — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: CategorySpendDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getCategorySpend(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseSummaryQueryDto,
  ) {
    return this.expenseSummary.getCategorySpend(query, user);
  }

  @Get('duplicate-transactions')
  @ApiOperation({
    summary:
      'Groups of expense transactions with the same vendor, date, and amount appearing more than once — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: DuplicateTransactionGroupDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getDuplicateTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrganizationIdQueryDto,
  ) {
    return this.duplicateDetection.findPossibleDuplicates(query, user);
  }

  @Get('cost-increase/supplier')
  @ApiOperation({
    summary:
      'Spend change for one supplier between two date ranges, classified price- vs volume-driven — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: SpendChangeDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getSupplierCostIncrease(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupplierSpendChangeQueryDto,
  ) {
    return this.costIncreaseFinding.getSupplierSpendChange(query, user);
  }

  @Get('cost-increase/category')
  @ApiOperation({
    summary:
      'Spend change for one category between two date ranges, classified price- vs volume-driven — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: SpendChangeDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getCategoryCostIncrease(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CategorySpendChangeQueryDto,
  ) {
    return this.costIncreaseFinding.getCategorySpendChange(query, user);
  }

  @Get('data-quality/issues/count')
  @ApiOperation({
    summary:
      'Count of expense transactions with no vendor or a non-positive amount, for the "Needs Review" badge — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: DataQualityIssueCountDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getDataQualityIssueCount(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrganizationIdQueryDto,
  ) {
    return this.dataQuality.countIssues(query, user);
  }

  @Get('data-quality/issues')
  @ApiOperation({
    summary:
      'Paginated list of expense transactions with no vendor or a non-positive amount, for the "review these" screen — must be your own organization, unless admin',
  })
  @ApiPaginatedResponse(ExpenseTransaction)
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getDataQualityIssues(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DataQualityIssuesQueryDto,
  ) {
    return this.dataQuality.listIssues(query, user);
  }
}
