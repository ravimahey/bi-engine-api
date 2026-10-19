import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
  ResponseMessage,
} from '@common/decorators';
import { IdParamDto } from '@common/dto';
import { CommercePayment } from './entities/payment.entity';
import { InvoicesService } from './services/invoices.service';

@ApiTags('Commerce - Payments')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Caller has no organization yet' })
@Controller('payments')
export class PaymentsController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ResponseMessage('Payments fetched successfully')
  @ApiOperation({ summary: 'List all payments for organization' })
  @ApiOkResponse({ type: [CommercePayment] })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<CommercePayment[]> {
    return this.invoicesService.getPayments(user.organizationId!);
  }

  @Post(':id/refund')
  @ResponseMessage('Payment refunded successfully')
  @ApiOperation({ summary: 'Refund payment and recalculate invoice balance' })
  @ApiOkResponse({ type: CommercePayment })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body('reason') reason?: string,
  ): Promise<CommercePayment> {
    return this.invoicesService.refundPayment(user.organizationId!, id, reason);
  }
}
