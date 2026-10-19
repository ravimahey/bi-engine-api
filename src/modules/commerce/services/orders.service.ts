import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignalType } from '@modules/signals/entities/signal.entity';
import { SignalsService } from '@modules/signals/services/signals.service';
import { CreateOrderDto, PackOrderDto, RejectAdjustmentDto } from '../dto/order.dto';
import {
  CommerceOrder,
  OrderStatus,
  AdjustmentStatus,
  OrderItem,
} from '../entities/order.entity';
import {
  CommerceInvoice,
  CommerceInvoiceStatus,
  InvoiceLineItem,
} from '../entities/invoice.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(CommerceOrder)
    private readonly ordersRepo: Repository<CommerceOrder>,
    @InjectRepository(CommerceInvoice)
    private readonly invoicesRepo: Repository<CommerceInvoice>,
    private readonly signalsService: SignalsService,
  ) {}

  async create(organizationId: string, dto: CreateOrderDto): Promise<CommerceOrder> {
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

    let requestedTotal = 0;
    const items: OrderItem[] = dto.items.map((item) => {
      const taxRate = item.taxRate || 0;
      const baseLine = item.requestedQuantity * item.unitPrice;
      const lineTax = baseLine * (taxRate / 100);
      const lineTotal = Number((baseLine + lineTax).toFixed(2));

      requestedTotal += lineTotal;

      return {
        ...item,
        packedQuantity: null,
        taxRate,
        lineTotal,
        adjustedLineTotal: null,
      };
    });

    requestedTotal = Number(requestedTotal.toFixed(2));

    const order = this.ordersRepo.create({
      orderNumber,
      organizationId,
      supplierId: dto.supplierId || null,
      buyerId: dto.buyerId || null,
      quoteId: dto.quoteId || null,
      status: OrderStatus.READY_TO_PACK,
      adjustmentStatus: AdjustmentStatus.NONE,
      requestedTotal,
      adjustedTotal: null,
      finalTotal: null,
      notes: dto.notes || null,
      items,
    });

    const savedOrder = await this.ordersRepo.save(order);

    // Event-driven signal: order_ready_to_pack for Supplier
    await this.signalsService.createSignal({
      organizationId,
      type: SignalType.ORDER_READY_TO_PACK,
      sourceId: savedOrder.id,
      title: 'Order Ready to Pack',
      message: `Order #${savedOrder.orderNumber} is ready to pack ($${savedOrder.requestedTotal.toFixed(2)})`,
      metadata: {
        orderId: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
        total: savedOrder.requestedTotal,
      },
    });

    return savedOrder;
  }

  async findAll(organizationId: string): Promise<CommerceOrder[]> {
    return this.ordersRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(organizationId: string, id: string): Promise<CommerceOrder> {
    const order = await this.ordersRepo.findOne({
      where: { id, organizationId },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID "${id}" not found`);
    }
    return order;
  }

  async packOrder(
    organizationId: string,
    id: string,
    dto: PackOrderDto,
  ): Promise<CommerceOrder> {
    const order = await this.findOne(organizationId, id);

    let hasQuantityAdjustment = false;
    let adjustedTotal = 0;

    const updatedItems = order.items.map((item, idx) => {
      // Find matching packed item by id or description or index
      const packed =
        dto.packedItems.find(
          (p) =>
            (p.itemId && p.itemId === item.itemId) ||
            p.description === item.description,
        ) || dto.packedItems[idx];

      const packedQty = packed !== undefined ? packed.packedQuantity : item.requestedQuantity;
      if (packedQty !== item.requestedQuantity) {
        hasQuantityAdjustment = true;
      }

      const taxRate = item.taxRate || 0;
      const baseLine = packedQty * item.unitPrice;
      const lineTax = baseLine * (taxRate / 100);
      const adjustedLineTotal = Number((baseLine + lineTax).toFixed(2));

      adjustedTotal += adjustedLineTotal;

      return {
        ...item,
        packedQuantity: packedQty,
        adjustedLineTotal,
      };
    });

    adjustedTotal = Number(adjustedTotal.toFixed(2));
    order.items = updatedItems;
    order.packedAt = new Date();

    // Clear order_ready_to_pack signal as supplier has now packed
    await this.signalsService.resolveSignal({
      organizationId,
      type: SignalType.ORDER_READY_TO_PACK,
      sourceId: order.id,
    });

    if (hasQuantityAdjustment) {
      order.status = OrderStatus.PENDING_ADJUSTMENT;
      order.adjustmentStatus = AdjustmentStatus.PENDING;
      order.adjustedTotal = adjustedTotal;
      order.adjustmentReason = dto.adjustmentReason || 'Quantity adjusted during packing';

      const saved = await this.ordersRepo.save(order);

      // Trigger order_needs_action signal for buyer
      await this.signalsService.createSignal({
        organizationId,
        type: SignalType.ORDER_NEEDS_ACTION,
        sourceId: order.id,
        title: 'Order Adjustment Needs Confirmation',
        message: `Order #${order.orderNumber} was adjusted during packing (new total: $${order.adjustedTotal.toFixed(2)} vs requested: $${order.requestedTotal.toFixed(2)})`,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          requestedTotal: order.requestedTotal,
          adjustedTotal: order.adjustedTotal,
          reason: order.adjustmentReason,
        },
      });

      return saved;
    } else {
      // 100% match, no adjustment needed
      order.status = OrderStatus.CONFIRMED;
      order.adjustmentStatus = AdjustmentStatus.NONE;
      order.finalTotal = order.requestedTotal;
      order.confirmedAt = new Date();

      return this.ordersRepo.save(order);
    }
  }

  async confirmAdjustment(
    organizationId: string,
    id: string,
  ): Promise<CommerceOrder> {
    const order = await this.findOne(organizationId, id);

    if (order.status !== OrderStatus.PENDING_ADJUSTMENT) {
      throw new BadRequestException(
        `Order is in "${order.status}" status, not "pending_adjustment"`,
      );
    }

    order.status = OrderStatus.CONFIRMED;
    order.adjustmentStatus = AdjustmentStatus.CONFIRMED;
    // CRITICAL: Final transaction total is the buyer-confirmed adjusted total!
    order.finalTotal = order.adjustedTotal ?? order.requestedTotal;
    order.confirmedAt = new Date();

    const saved = await this.ordersRepo.save(order);

    // Auto-resolve the order_needs_action signal
    await this.signalsService.resolveSignal({
      organizationId,
      type: SignalType.ORDER_NEEDS_ACTION,
      sourceId: order.id,
    });

    return saved;
  }

  async rejectAdjustment(
    organizationId: string,
    id: string,
    dto: RejectAdjustmentDto,
  ): Promise<CommerceOrder> {
    const order = await this.findOne(organizationId, id);

    if (order.status !== OrderStatus.PENDING_ADJUSTMENT) {
      throw new BadRequestException(
        `Order is in "${order.status}" status, not "pending_adjustment"`,
      );
    }

    order.adjustmentStatus = AdjustmentStatus.REJECTED;
    order.status = OrderStatus.SUBMITTED; // Reverts to submitted for re-packing or re-negotiation

    const saved = await this.ordersRepo.save(order);

    // Auto-resolve buyer's order_needs_action
    await this.signalsService.resolveSignal({
      organizationId,
      type: SignalType.ORDER_NEEDS_ACTION,
      sourceId: order.id,
    });

    // Event-driven signal: adjustment_rejected for Supplier
    await this.signalsService.createSignal({
      organizationId,
      type: SignalType.ADJUSTMENT_REJECTED,
      sourceId: order.id,
      title: 'Order Adjustment Rejected',
      message: `Buyer rejected adjustment for Order #${order.orderNumber}${dto.reason ? `: ${dto.reason}` : ''}`,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: dto.reason,
      },
    });

    return saved;
  }

  async generateInvoice(
    organizationId: string,
    id: string,
  ): Promise<CommerceInvoice> {
    const order = await this.findOne(organizationId, id);

    if (order.status !== OrderStatus.CONFIRMED && order.status !== OrderStatus.FULFILLED) {
      throw new BadRequestException(
        `Cannot generate invoice for order in "${order.status}" status. Order must be confirmed first.`,
      );
    }

    // Check if invoice already exists for this order
    const existing = await this.invoicesRepo.findOne({
      where: { orderId: order.id, organizationId },
    });
    if (existing) {
      return existing;
    }

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    
    // CRITICAL: Invoice total MUST strictly be the buyer-confirmed finalTotal!
    const finalTotal = order.finalTotal ?? order.requestedTotal;

    let subtotal = 0;
    let tax = 0;

    const lineItems: InvoiceLineItem[] = order.items.map((item) => {
      const qty = item.packedQuantity !== null && item.packedQuantity !== undefined ? item.packedQuantity : item.requestedQuantity;
      const taxRate = item.taxRate || 0;
      const baseLine = qty * item.unitPrice;
      const lineTax = baseLine * (taxRate / 100);
      const lineTotal = Number((baseLine + lineTax).toFixed(2));

      subtotal += baseLine;
      tax += lineTax;

      return {
        itemId: item.itemId,
        description: item.description,
        quantity: qty,
        unit: item.unit,
        unitPrice: item.unitPrice,
        taxRate,
        lineTotal,
      };
    });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30); // Net 30 default

    const invoice = this.invoicesRepo.create({
      invoiceNumber,
      organizationId,
      orderId: order.id,
      supplierId: order.supplierId,
      buyerId: order.buyerId,
      status: CommerceInvoiceStatus.ISSUED,
      issueDate: new Date(),
      dueDate,
      subtotal: Number(subtotal.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      total: Number(finalTotal.toFixed(2)),
      amountPaid: 0,
      balanceDue: Number(finalTotal.toFixed(2)),
      lineItems,
      notes: `Generated from Order #${order.orderNumber}`,
    });

    return this.invoicesRepo.save(invoice);
  }
}
