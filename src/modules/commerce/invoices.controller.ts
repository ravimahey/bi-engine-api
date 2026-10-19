import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { CreateInvoiceDto, QueryInvoicesDto, RecordPaymentDto } from './dto/invoice.dto';
import { CommerceInvoice } from './entities/invoice.entity';
import { CommercePayment } from './entities/payment.entity';
import { InvoicesService } from './services/invoices.service';

@ApiTags('Commerce - Invoices')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Caller has no organization yet' })
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @ResponseMessage('Invoice created successfully')
  @ApiOperation({ summary: 'Create a new invoice' })
  @ApiOkResponse({ type: CommerceInvoice })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ): Promise<CommerceInvoice> {
    return this.invoicesService.create(user.organizationId!, dto);
  }

  @Get()
  @ResponseMessage('Invoices fetched successfully')
  @ApiOperation({ summary: 'List all invoices for organization (filter by status)' })
  @ApiOkResponse({ type: [CommerceInvoice] })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryInvoicesDto,
  ): Promise<CommerceInvoice[]> {
    return this.invoicesService.findAll(user.organizationId!, query);
  }

  @Post('scan-overdue')
  @ResponseMessage('Overdue invoice scan completed')
  @ApiOperation({ summary: 'Scan invoices and raise invoice_overdue signals for past due balances' })
  scanOverdue(@CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.checkAndMarkOverdue(user.organizationId!);
  }

  @Get(':id')
  @ResponseMessage('Invoice fetched successfully')
  @ApiOperation({ summary: 'Get invoice by ID' })
  @ApiOkResponse({ type: CommerceInvoice })
  @ApiNotFoundResponse({ description: 'Invoice not found' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<CommerceInvoice> {
    return this.invoicesService.findOne(user.organizationId!, id);
  }

  @Post(':id/payments')
  @ResponseMessage('Payment recorded successfully')
  @ApiOperation({ summary: 'Record payment for invoice (updates balance and auto-resolves overdue signals)' })
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.invoicesService.recordPayment(user.organizationId!, id, dto);
  }

  @Get(':id/payments')
  @ResponseMessage('Payments fetched successfully')
  @ApiOperation({ summary: 'Get all payments for invoice' })
  @ApiOkResponse({ type: [CommercePayment] })
  getPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<CommercePayment[]> {
    return this.invoicesService.getPayments(user.organizationId!, id);
  }
}
