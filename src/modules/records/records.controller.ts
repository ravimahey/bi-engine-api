import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '@common/decorators';
import { ExpenseTransactionFilterQueryDto } from './dto';
import { RecordsFilterService } from './services';

/**
 * The public API surface over canonical spend data — what the dashboard, the
 * findings engine, and "Ask Ordaraa" call. Never exposes or depends on
 * QuickBooks-specific fields/types; every response is shaped from the
 * provider-agnostic records/* entities only.
 */
@ApiTags('Records')
@ApiBearerAuth('access-token')
@Controller('records')
export class RecordsController {
  constructor(private readonly recordsFilter: RecordsFilterService) {}

  @Get('expense-transaction-lines')
  @ApiOperation({
    summary:
      'Filter canonical expense-transaction lines by vendor/category/item/date/amount, across every connected provider — must be your own organization, unless admin',
  })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  findExpenseTransactionLines(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseTransactionFilterQueryDto,
  ) {
    return this.recordsFilter.filter(query, user);
  }
}
