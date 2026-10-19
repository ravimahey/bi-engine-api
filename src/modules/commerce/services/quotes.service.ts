import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignalSourceType, SignalType } from '@modules/signals/entities/signal.entity';
import { SignalsService } from '@modules/signals/services/signals.service';
import { CreateQuoteDto } from '../dto/create-quote.dto';
import { Quote, QuoteStatus } from '../entities/quote.entity';
import { CommerceOrder, OrderStatus, AdjustmentStatus } from '../entities/order.entity';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(CommerceOrder)
    private readonly ordersRepo: Repository<CommerceOrder>,
    private readonly signalsService: SignalsService,
  ) {}

  async create(organizationId: string, dto: CreateQuoteDto): Promise<Quote> {
    const quoteNumber = `QUO-${Date.now().toString().slice(-6)}`;
    
    let subtotal = 0;
    let tax = 0;

    const items = dto.items.map((item) => {
      const discount = item.discount || 0;
      const baseLineTotal = item.quantity * item.unitPrice * (1 - discount / 100);
      const taxRate = item.taxRate || 0;
      const itemTax = baseLineTotal * (taxRate / 100);
      const lineTotal = Number((baseLineTotal + itemTax).toFixed(2));

      subtotal += baseLineTotal;
      tax += itemTax;

      return {
        ...item,
        lineTotal,
      };
    });

    const total = Number((subtotal + tax).toFixed(2));

    const quote = this.quotesRepo.create({
      quoteNumber,
      organizationId,
      supplierId: dto.supplierId || null,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      notes: dto.notes || null,
      items,
      subtotal: Number(subtotal.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      total,
      status: QuoteStatus.DRAFT,
    });

    return this.quotesRepo.save(quote);
  }

  async findAll(organizationId: string): Promise<Quote[]> {
    return this.quotesRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(organizationId: string, id: string): Promise<Quote> {
    const quote = await this.quotesRepo.findOne({
      where: { id, organizationId },
    });
    if (!quote) {
      throw new NotFoundException(`Quote with ID "${id}" not found`);
    }
    return quote;
  }

  async send(organizationId: string, id: string): Promise<Quote> {
    const quote = await this.findOne(organizationId, id);
    quote.status = QuoteStatus.SENT;
    return this.quotesRepo.save(quote);
  }

  async accept(organizationId: string, id: string): Promise<Quote> {
    const quote = await this.findOne(organizationId, id);
    quote.status = QuoteStatus.ACCEPTED;
    return this.quotesRepo.save(quote);
  }

  async decline(organizationId: string, id: string): Promise<Quote> {
    const quote = await this.findOne(organizationId, id);
    quote.status = QuoteStatus.DECLINED;
    return this.quotesRepo.save(quote);
  }

  async convertToOrder(
    organizationId: string,
    id: string,
  ): Promise<{ quote: Quote; order: CommerceOrder }> {
    const quote = await this.findOne(organizationId, id);

    if (quote.orderId) {
      throw new ConflictException(
        `Quote ${quote.quoteNumber} has already been converted to an order`,
      );
    }

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    
    const orderItems = quote.items.map((qi) => ({
      itemId: qi.itemId,
      description: qi.description,
      requestedQuantity: qi.quantity,
      packedQuantity: null,
      unit: qi.unit,
      unitPrice: qi.unitPrice,
      taxRate: qi.taxRate || 0,
      lineTotal: qi.lineTotal,
      adjustedLineTotal: null,
    }));

    const order = this.ordersRepo.create({
      orderNumber,
      organizationId,
      supplierId: quote.supplierId,
      quoteId: quote.id,
      status: OrderStatus.READY_TO_PACK,
      adjustmentStatus: AdjustmentStatus.NONE,
      requestedTotal: quote.total,
      adjustedTotal: null,
      finalTotal: null,
      notes: quote.notes ? `Converted from Quote ${quote.quoteNumber}: ${quote.notes}` : `Converted from Quote ${quote.quoteNumber}`,
      items: orderItems,
    });

    const savedOrder = await this.ordersRepo.save(order);

    quote.status = QuoteStatus.ACCEPTED;
    quote.orderId = savedOrder.id;
    const savedQuote = await this.quotesRepo.save(quote);

    // Event-driven signal creation: order_ready_to_pack for Supplier
    await this.signalsService.createSignal({
      organizationId,
      type: SignalType.ORDER_READY_TO_PACK,
      sourceType: SignalSourceType.ORDER,
      sourceId: savedOrder.id,
      title: 'Order Ready to Pack',
      message: `Order #${savedOrder.orderNumber} is ready to pack ($${savedOrder.requestedTotal.toFixed(2)})`,
      metadata: {
        orderId: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
        quoteId: quote.id,
        total: savedOrder.requestedTotal,
      },
    });

    return { quote: savedQuote, order: savedOrder };
  }
}
