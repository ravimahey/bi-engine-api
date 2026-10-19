import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
  ResponseMessage,
} from '@common/decorators';
import { InvoicesService } from './services/invoices.service';

@ApiTags('Commerce')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Caller has no organization yet' })
@Controller('commerce')
export class CommerceController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('cash-flow')
  @ResponseMessage('Cash flow aggregates fetched successfully')
  @ApiOperation({ summary: 'Get deterministic cash flow totals (invoiced, paid, outstanding, overdue)' })
  getCashFlow(@CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.getCashFlowAggregates(user.organizationId!);
  }
}
