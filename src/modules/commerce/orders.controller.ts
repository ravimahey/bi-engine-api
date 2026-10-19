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
import { CreateOrderDto, PackOrderDto, RejectAdjustmentDto } from './dto/order.dto';
import { CommerceOrder } from './entities/order.entity';
import { CommerceInvoice } from './entities/invoice.entity';
import { OrdersService } from './services/orders.service';

@ApiTags('Commerce - Orders')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Caller has no organization yet' })
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ResponseMessage('Order created successfully')
  @ApiOperation({ summary: 'Create a new order' })
  @ApiOkResponse({ type: CommerceOrder })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<CommerceOrder> {
    return this.ordersService.create(user.organizationId!, dto);
  }

  @Get()
  @ResponseMessage('Orders fetched successfully')
  @ApiOperation({ summary: 'List all orders for current organization' })
  @ApiOkResponse({ type: [CommerceOrder] })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<CommerceOrder[]> {
    return this.ordersService.findAll(user.organizationId!);
  }

  @Get(':id')
  @ResponseMessage('Order fetched successfully')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiOkResponse({ type: CommerceOrder })
  @ApiNotFoundResponse({ description: 'Order not found' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<CommerceOrder> {
    return this.ordersService.findOne(user.organizationId!, id);
  }

  @Post(':id/pack')
  @ResponseMessage('Order packed successfully')
  @ApiOperation({ summary: 'Supplier inputs packed quantities for order' })
  @ApiOkResponse({ type: CommerceOrder })
  pack(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: PackOrderDto,
  ): Promise<CommerceOrder> {
    return this.ordersService.packOrder(user.organizationId!, id, dto);
  }

  @Post(':id/confirm-adjustment')
  @ResponseMessage('Order adjustment confirmed successfully')
  @ApiOperation({ summary: 'Buyer confirms packed quantity adjustment' })
  @ApiOkResponse({ type: CommerceOrder })
  confirmAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<CommerceOrder> {
    return this.ordersService.confirmAdjustment(user.organizationId!, id);
  }

  @Post(':id/reject-adjustment')
  @ResponseMessage('Order adjustment rejected')
  @ApiOperation({ summary: 'Buyer rejects packed quantity adjustment' })
  @ApiOkResponse({ type: CommerceOrder })
  rejectAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: RejectAdjustmentDto,
  ): Promise<CommerceOrder> {
    return this.ordersService.rejectAdjustment(user.organizationId!, id, dto);
  }

  @Post(':id/generate-invoice')
  @ResponseMessage('Invoice generated successfully')
  @ApiOperation({ summary: 'Generate commercial invoice from confirmed order' })
  @ApiOkResponse({ type: CommerceInvoice })
  generateInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<CommerceInvoice> {
    return this.ordersService.generateInvoice(user.organizationId!, id);
  }
}
