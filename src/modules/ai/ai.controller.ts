import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@common/decorators';
import type { AuthenticatedUser } from '@common/decorators';
import {
  CategorySpendChangeQueryDto,
  SupplierSpendChangeQueryDto,
} from '@modules/analytics/dto';
import { AI_THROTTLE } from './constants';
import { ExplainedCostIncreaseDto } from './dto';
import { CostIncreaseExplainerService } from './services';

/**
 * AI explanations layered over the analytics findings — sibling `/explain`
 * routes under the same `analytics/cost-increase` path, so the existing
 * endpoints and their responses are untouched. Thin: DTO validation
 * (global pipe) → one service call → return. Throttled tighter than the
 * global limit because every call can cost a Gemini request.
 */
@ApiTags('AI')
@ApiBearerAuth('access-token')
@Throttle({ default: AI_THROTTLE })
@Controller('analytics/cost-increase')
export class AiController {
  constructor(private readonly explainer: CostIncreaseExplainerService) {}

  @Get('category/explain')
  @ApiOperation({
    summary:
      'Category spend change between two date ranges, plus an AI plain-language explanation and advisory options (explanation is null if AI is off/unavailable) — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: ExplainedCostIncreaseDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'Category does not exist' })
  explainCategoryCostIncrease(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CategorySpendChangeQueryDto,
  ) {
    return this.explainer.explainCategory(query, user);
  }

  @Get('supplier/explain')
  @ApiOperation({
    summary:
      'Supplier spend change between two date ranges, plus an AI plain-language explanation and advisory options (explanation is null if AI is off/unavailable) — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: ExplainedCostIncreaseDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'Supplier does not exist' })
  explainSupplierCostIncrease(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupplierSpendChangeQueryDto,
  ) {
    return this.explainer.explainSupplier(query, user);
  }
}
