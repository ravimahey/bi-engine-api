import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SignalSourceType, SignalType } from '@modules/signals/entities/signal.entity';
import { SignalsService } from '@modules/signals/services/signals.service';
import { QuotesService } from './services/quotes.service';
import { OrdersService } from './services/orders.service';
import { InvoicesService } from './services/invoices.service';
import { Quote, QuoteStatus } from './entities/quote.entity';
import { CommerceOrder, OrderStatus, AdjustmentStatus } from './entities/order.entity';
import { CommerceInvoice, CommerceInvoiceStatus } from './entities/invoice.entity';
import { CommercePayment, CommercePaymentMethod, CommercePaymentStatus } from './entities/payment.entity';

describe('Commerce & Signals Integration Workflow', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';

  let quotesService: QuotesService;
  let ordersService: OrdersService;
  let invoicesService: InvoicesService;

  let quotesRepo: any;
  let ordersRepo: any;
  let invoicesRepo: any;
  let paymentsRepo: any;
  let signalsService: any;

  beforeEach(() => {
    // In-memory mock repositories
    const quotesStore = new Map<string, Quote>();
    const ordersStore = new Map<string, CommerceOrder>();
    const invoicesStore = new Map<string, CommerceInvoice>();
    const paymentsStore = new Map<string, CommercePayment>();

    quotesRepo = {
      create: jest.fn((entity) => ({
        id: `quote-${Date.now()}-${Math.random()}`,
        ...entity,
      })),
      save: jest.fn(async (entity) => {
        quotesStore.set(entity.id, entity);
        return entity;
      }),
      findOne: jest.fn(async ({ where }) => {
        return quotesStore.get(where.id) || null;
      }),
      find: jest.fn(async () => Array.from(quotesStore.values())),
    };

    ordersRepo = {
      create: jest.fn((entity) => ({
        id: `order-${Date.now()}-${Math.random()}`,
        ...entity,
      })),
      save: jest.fn(async (entity) => {
        ordersStore.set(entity.id, entity);
        return entity;
      }),
      findOne: jest.fn(async ({ where }) => {
        return ordersStore.get(where.id) || null;
      }),
      find: jest.fn(async () => Array.from(ordersStore.values())),
    };

    invoicesRepo = {
      create: jest.fn((entity) => ({
        id: `inv-${Date.now()}-${Math.random()}`,
        ...entity,
      })),
      save: jest.fn(async (entity) => {
        invoicesStore.set(entity.id, entity);
        return entity;
      }),
      findOne: jest.fn(async ({ where }) => {
        if (where.orderId) {
          return (
            Array.from(invoicesStore.values()).find(
              (i) => i.orderId === where.orderId && i.organizationId === where.organizationId,
            ) || null
          );
        }
        return invoicesStore.get(where.id) || null;
      }),
      find: jest.fn(async () => Array.from(invoicesStore.values())),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => Array.from(invoicesStore.values())),
      })),
    };

    paymentsRepo = {
      create: jest.fn((entity) => ({
        id: `pay-${Date.now()}-${Math.random()}`,
        ...entity,
      })),
      save: jest.fn(async (entity) => {
        paymentsStore.set(entity.id, entity);
        return entity;
      }),
      findOne: jest.fn(async ({ where }) => {
        return paymentsStore.get(where.id) || null;
      }),
      find: jest.fn(async ({ where }) => {
        return Array.from(paymentsStore.values()).filter(
          (p) =>
            p.organizationId === where.organizationId &&
            (!where.invoiceId || p.invoiceId === where.invoiceId) &&
            (!where.status || p.status === where.status),
        );
      }),
    };

    signalsService = {
      createSignal: jest.fn().mockResolvedValue({ id: 'sig-1' }),
      resolveSignal: jest.fn().mockResolvedValue(1),
    };

    quotesService = new QuotesService(quotesRepo, ordersRepo, signalsService as unknown as SignalsService);
    ordersService = new OrdersService(ordersRepo, invoicesRepo, signalsService as unknown as SignalsService);
    invoicesService = new InvoicesService(invoicesRepo, paymentsRepo, signalsService as unknown as SignalsService);
  });

  describe('1. Quotes & Conversion to Order', () => {
    it('creates a quote with line items and subtotal/tax/total', async () => {
      const quote = await quotesService.create(orgId, {
        items: [
          {
            description: 'King Prawns',
            quantity: 100,
            unit: 'kg',
            unitPrice: 10,
            taxRate: 0,
          },
        ],
      });

      expect(quote.total).toBe(1000);
      expect(quote.status).toBe(QuoteStatus.DRAFT);
      expect(quote.quoteNumber).toMatch(/^QUO-/);
    });

    it('converts an accepted quote to order, raises order_ready_to_pack signal, and prevents re-conversion', async () => {
      const quote = await quotesService.create(orgId, {
        items: [
          {
            description: 'King Prawns',
            quantity: 100,
            unit: 'kg',
            unitPrice: 10,
            taxRate: 0,
          },
        ],
      });

      const { quote: convertedQuote, order } = await quotesService.convertToOrder(orgId, quote.id);

      expect(convertedQuote.orderId).toBe(order.id);
      expect(convertedQuote.status).toBe(QuoteStatus.ACCEPTED);
      expect(order.requestedTotal).toBe(1000);
      expect(order.status).toBe(OrderStatus.READY_TO_PACK);

      // Signal check
      expect(signalsService.createSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          type: SignalType.ORDER_READY_TO_PACK,
          sourceType: SignalSourceType.ORDER,
          sourceId: order.id,
        }),
      );

      // Attempt second conversion -> must throw ConflictException
      await expect(quotesService.convertToOrder(orgId, quote.id)).rejects.toThrow(ConflictException);
    });
  });

  describe('2. Direct Order Creation', () => {
    it('creates direct order and raises order_ready_to_pack signal', async () => {
      const order = await ordersService.create(orgId, {
        items: [
          {
            description: 'Tiger Prawns',
            requestedQuantity: 100,
            unit: 'kg',
            unitPrice: 10,
            taxRate: 0,
          },
        ],
      });

      expect(order.requestedTotal).toBe(1000);
      expect(order.status).toBe(OrderStatus.READY_TO_PACK);
      expect(signalsService.createSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SignalType.ORDER_READY_TO_PACK,
          sourceId: order.id,
        }),
      );
    });
  });

  describe('3. Order Packing & Packed-Quantity Adjustments', () => {
    it('handles exact packed match: sets status confirmed with finalTotal = requestedTotal', async () => {
      const order = await ordersService.create(orgId, {
        items: [
          {
            description: 'Barramundi Fillet',
            requestedQuantity: 50,
            unit: 'kg',
            unitPrice: 20,
            taxRate: 0,
          },
        ],
      });

      const packed = await ordersService.packOrder(orgId, order.id, {
        packedItems: [
          {
            description: 'Barramundi Fillet',
            packedQuantity: 50,
          },
        ],
      });

      expect(packed.status).toBe(OrderStatus.CONFIRMED);
      expect(packed.finalTotal).toBe(1000);
      expect(signalsService.resolveSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SignalType.ORDER_READY_TO_PACK,
          sourceId: order.id,
        }),
      );
    });

    it('handles packed quantity difference (100kg -> 96kg): enters pending_adjustment, creates order_needs_action signal', async () => {
      const order = await ordersService.create(orgId, {
        items: [
          {
            description: 'King Prawns',
            requestedQuantity: 100,
            unit: 'kg',
            unitPrice: 10,
            taxRate: 0,
          },
        ],
      });

      const packed = await ordersService.packOrder(orgId, order.id, {
        packedItems: [
          {
            description: 'King Prawns',
            packedQuantity: 96,
          },
        ],
        adjustmentReason: 'Short harvest yield, packed 96kg',
      });

      expect(packed.status).toBe(OrderStatus.PENDING_ADJUSTMENT);
      expect(packed.adjustmentStatus).toBe(AdjustmentStatus.PENDING);
      expect(packed.adjustedTotal).toBe(960);
      expect(packed.finalTotal).toBeNull();

      // Clears order_ready_to_pack
      expect(signalsService.resolveSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SignalType.ORDER_READY_TO_PACK,
          sourceId: order.id,
        }),
      );

      // Raises order_needs_action for buyer
      expect(signalsService.createSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SignalType.ORDER_NEEDS_ACTION,
          sourceType: SignalSourceType.ORDER,
          sourceId: order.id,
        }),
      );
    });
  });

  describe('4. Buyer Confirmation & Rejection Flow', () => {
    it('buyer confirms adjustment: sets finalTotal = $960, status confirmed, auto-resolves order_needs_action', async () => {
      const order = await ordersService.create(orgId, {
        items: [
          {
            description: 'King Prawns',
            requestedQuantity: 100,
            unit: 'kg',
            unitPrice: 10,
          },
        ],
      });

      await ordersService.packOrder(orgId, order.id, {
        packedItems: [{ description: 'King Prawns', packedQuantity: 96 }],
      });

      const confirmed = await ordersService.confirmAdjustment(orgId, order.id);

      expect(confirmed.status).toBe(OrderStatus.CONFIRMED);
      expect(confirmed.adjustmentStatus).toBe(AdjustmentStatus.CONFIRMED);
      expect(confirmed.finalTotal).toBe(960);

      // Auto-resolves buyer's order_needs_action
      expect(signalsService.resolveSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SignalType.ORDER_NEEDS_ACTION,
          sourceId: order.id,
        }),
      );
    });

    it('buyer rejects adjustment: resolves order_needs_action and raises adjustment_rejected for supplier', async () => {
      const order = await ordersService.create(orgId, {
        items: [
          {
            description: 'King Prawns',
            requestedQuantity: 100,
            unit: 'kg',
            unitPrice: 10,
          },
        ],
      });

      await ordersService.packOrder(orgId, order.id, {
        packedItems: [{ description: 'King Prawns', packedQuantity: 96 }],
      });

      const rejected = await ordersService.rejectAdjustment(orgId, order.id, {
        reason: 'Require full 100kg minimum for scheduled event',
      });

      expect(rejected.adjustmentStatus).toBe(AdjustmentStatus.REJECTED);

      // Auto-resolves buyer's signal
      expect(signalsService.resolveSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SignalType.ORDER_NEEDS_ACTION,
          sourceId: order.id,
        }),
      );

      // Raises adjustment_rejected for supplier
      expect(signalsService.createSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SignalType.ADJUSTMENT_REJECTED,
          sourceType: SignalSourceType.ORDER,
          sourceId: order.id,
        }),
      );
    });
  });

  describe('5. Invoice Generation with Buyer-Confirmed Final Total', () => {
    it('generates invoice strictly matching the confirmed $960 final total (NOT the original $1000)', async () => {
      const order = await ordersService.create(orgId, {
        items: [
          {
            description: 'King Prawns',
            requestedQuantity: 100,
            unit: 'kg',
            unitPrice: 10,
          },
        ],
      });

      await ordersService.packOrder(orgId, order.id, {
        packedItems: [{ description: 'King Prawns', packedQuantity: 96 }],
      });

      await ordersService.confirmAdjustment(orgId, order.id);

      const invoice = await ordersService.generateInvoice(orgId, order.id);

      expect(invoice.total).toBe(960);
      expect(invoice.subtotal).toBe(960);
      expect(invoice.balanceDue).toBe(960);
      expect(invoice.amountPaid).toBe(0);
      expect(invoice.status).toBe(CommerceInvoiceStatus.ISSUED);
      expect(invoice.lineItems[0].quantity).toBe(96);
    });

    it('refuses invoice generation if order is not confirmed', async () => {
      const order = await ordersService.create(orgId, {
        items: [{ description: 'Oysters', requestedQuantity: 20, unit: 'doz', unitPrice: 25 }],
      });

      await expect(ordersService.generateInvoice(orgId, order.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe('6. Payments, Partial Payments & Overdue Signal Resolution', () => {
    it('handles partial payment ($400 / $960 -> balance $560) and full payment ($560 -> paid, resolves signal)', async () => {
      // Create invoice
      const invoice = await invoicesService.create(orgId, {
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        lineItems: [
          {
            description: 'King Prawns',
            quantity: 96,
            unit: 'kg',
            unitPrice: 10,
          },
        ],
      });

      expect(invoice.total).toBe(960);
      expect(invoice.balanceDue).toBe(960);

      // 1. Partial payment: $400
      const { payment: p1, invoice: invAfterP1 } = await invoicesService.recordPayment(orgId, invoice.id, {
        amount: 400,
        paymentMethod: CommercePaymentMethod.BANK_TRANSFER,
      });

      expect(p1.amount).toBe(400);
      expect(invAfterP1.amountPaid).toBe(400);
      expect(invAfterP1.balanceDue).toBe(560);
      expect(invAfterP1.status).toBe(CommerceInvoiceStatus.PARTIALLY_PAID);

      // 2. Final payment: $560
      const { payment: p2, invoice: invAfterP2 } = await invoicesService.recordPayment(orgId, invoice.id, {
        amount: 560,
        paymentMethod: CommercePaymentMethod.STRIPE,
      });

      expect(p2.amount).toBe(560);
      expect(invAfterP2.amountPaid).toBe(960);
      expect(invAfterP2.balanceDue).toBe(0);
      expect(invAfterP2.status).toBe(CommerceInvoiceStatus.PAID);

      // Verifies overdue signal auto-resolution
      expect(signalsService.resolveSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SignalType.INVOICE_OVERDUE,
          sourceType: SignalSourceType.INVOICE,
          sourceId: invoice.id,
        }),
      );
    });

    it('rejects payment amount exceeding outstanding balance', async () => {
      const invoice = await invoicesService.create(orgId, {
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        lineItems: [{ description: 'Salmon', quantity: 10, unit: 'kg', unitPrice: 20 }],
      });

      await expect(
        invoicesService.recordPayment(orgId, invoice.id, {
          amount: 300, // Total is 200
          paymentMethod: CommercePaymentMethod.CASH,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refunds payment and re-opens invoice balance', async () => {
      const invoice = await invoicesService.create(orgId, {
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        lineItems: [{ description: 'Crab', quantity: 10, unit: 'kg', unitPrice: 10 }],
      });

      const { payment } = await invoicesService.recordPayment(orgId, invoice.id, {
        amount: 100,
        paymentMethod: CommercePaymentMethod.BANK_TRANSFER,
      });

      expect((await invoicesService.findOne(orgId, invoice.id)).status).toBe(CommerceInvoiceStatus.PAID);

      await invoicesService.refundPayment(orgId, payment.id, 'Customer cancellation');

      const recheckedInvoice = await invoicesService.findOne(orgId, invoice.id);
      expect(recheckedInvoice.amountPaid).toBe(0);
      expect(recheckedInvoice.balanceDue).toBe(100);
      expect(recheckedInvoice.status).toBe(CommerceInvoiceStatus.ISSUED);
    });
  });

  describe('7. Cash Flow Aggregates', () => {
    it('accurately computes totalInvoiced, totalPaid, and totalOutstanding', async () => {
      const inv1 = await invoicesService.create(orgId, {
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        lineItems: [{ description: 'Item 1', quantity: 10, unit: 'kg', unitPrice: 50 }], // $500
      });

      const inv2 = await invoicesService.create(orgId, {
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        lineItems: [{ description: 'Item 2', quantity: 10, unit: 'kg', unitPrice: 20 }], // $200
      });

      await invoicesService.recordPayment(orgId, inv1.id, {
        amount: 500,
        paymentMethod: CommercePaymentMethod.BANK_TRANSFER,
      });

      const cashFlow = await invoicesService.getCashFlowAggregates(orgId);

      expect(cashFlow.totalInvoiced).toBe(700);
      expect(cashFlow.totalPaid).toBe(500);
      expect(cashFlow.totalOutstanding).toBe(200);
      expect(cashFlow.invoiceCount).toBe(2);
      expect(cashFlow.paymentCount).toBe(1);
    });
  });
});
