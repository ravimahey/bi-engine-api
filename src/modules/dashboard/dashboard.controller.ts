import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators';
import type { AuthenticatedUser } from '@common/decorators';
import {
  RevenueVsSpendDto,
  RevenueVsSpendQueryDto,
  SpendBreakdownDto,
  SpendBreakdownQueryDto,
  SpendTrendDto,
  SpendTrendQueryDto,
} from './dto';
import {
  RevenueVsSpendService,
  SpendBreakdownService,
  SpendTrendService,
} from './services';

/** Dashboard graph data — thin: DTO validation (global pipe) → one service call → return. */
@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly spendTrend: SpendTrendService,
    private readonly spendBreakdown: SpendBreakdownService,
    private readonly revenueVsSpend: RevenueVsSpendService,
  ) {}

  @Get('spend-trend')
  @ApiOperation({
    summary:
      'Graph 1: spend per day/week/month over a date range, optionally filtered by vendor/category — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: SpendTrendDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getSpendTrend(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SpendTrendQueryDto,
  ) {
    return this.spendTrend.getSpendTrend(query, user);
  }

  @Get('spend-breakdown')
  @ApiOperation({
    summary:
      'Graph 2: top-N vendors or categories by spend with an "Other" row, optionally filtered — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: SpendBreakdownDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getSpendBreakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SpendBreakdownQueryDto,
  ) {
    return this.spendBreakdown.getSpendBreakdown(query, user);
  }

  @Get('revenue-vs-spend')
  @ApiOperation({
    summary:
      'Graph 3: revenue, spend and net per day/week/month, optionally filtered by customer/vendor — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: RevenueVsSpendDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  getRevenueVsSpend(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RevenueVsSpendQueryDto,
  ) {
    return this.revenueVsSpend.getRevenueVsSpend(query, user);
  }
}
