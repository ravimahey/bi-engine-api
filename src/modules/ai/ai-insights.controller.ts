import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@common/decorators';
import type { AuthenticatedUser } from '@common/decorators';
import { OrganizationIdQueryDto } from '@modules/analytics/dto';
import { AI_THROTTLE } from './constants';
import {
  ExpenseSummaryExplainQueryDto,
  ExplainedDataQualityDto,
  ExplainedDuplicatesDto,
  ExplainedExpenseSummaryDto,
} from './dto';
import {
  DataQualityExplainerService,
  DuplicateExplainerService,
  ExpenseSummaryExplainerService,
} from './services';

/**
 * AI explanations over the remaining analytics endpoints - sibling
 * `/explain` routes next to the existing ones, so their responses are
 * untouched. Thin: DTO validation (global pipe) -> one service call ->
 * return. Every route returns the deterministic data even when AI is off or
 * fails (`explanation: null`).
 */
@ApiTags('AI')
@ApiBearerAuth('access-token')
@Throttle({ default: AI_THROTTLE })
@Controller('analytics')
export class AiInsightsController {
  constructor(
    private readonly duplicates: DuplicateExplainerService,
    private readonly dataQuality: DataQualityExplainerService,
    private readonly expenseSummary: ExpenseSummaryExplainerService,
  ) {}

  @Get('duplicate-transactions/explain')
  @ApiOperation({
    summary:
      'Possible duplicate transaction groups plus an AI explanation and review checklist per group (explanation is null if AI is off/unavailable) — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: ExplainedDuplicatesDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  explainDuplicateTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrganizationIdQueryDto,
  ) {
    return this.duplicates.explain(query, user);
  }

  @Get('data-quality/explain')
  @ApiOperation({
    summary:
      'Rule-based data-quality status and issue count plus an AI explanation of why it matters and how to fix it (explanation is null if AI is off/unavailable) — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: ExplainedDataQualityDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  explainDataQuality(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrganizationIdQueryDto,
  ) {
    return this.dataQuality.explain(query, user);
  }

  @Get('expense-summary/explain')
  @ApiOperation({
    summary:
      'Total spend, top-category shares and optional prior-period comparison plus an AI dashboard summary (explanation is null if AI is off/unavailable) — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: ExplainedExpenseSummaryDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  explainExpenseSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseSummaryExplainQueryDto,
  ) {
    return this.expenseSummary.explain(query, user);
  }
}
