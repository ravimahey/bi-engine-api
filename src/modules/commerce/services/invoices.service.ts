import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SignalSourceType, SignalType } from '@modules/signals/entities/signal.entity';
import { SignalsService } from '@modules/signals/services/signals.service';
import { CreateInvoiceDto, RecordPaymentDto } from '../dto/invoice.dto';
import {
  CommerceInvoice,
  CommerceInvoiceStatus,
} from '../entities/invoice.entity';
import {
  CommercePayment,
  CommercePaymentMethod,
  CommercePaymentStatus,
} from '../entities/payment.entity';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(CommerceInvoice)
    private readonly invoicesRepo: Repository<CommerceInvoice>,
    @InjectRepository(CommercePayment)
    private readonly paymentsRepo: Repository<CommercePayment>,
    private readonly signalsService: SignalsService,
  ) {}

  async create(organizationId: string, dto: CreateInvoiceDto): Promise<CommerceInvoice> {
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

    let subtotal = 0;
    let tax = 0;

    const lineItems = dto.lineItems.map((item) => {
      const taxRate = item.taxRate || 0;
      const baseLine = item.quantity * item.unitPrice;
      const itemTax = baseLine * (taxRate / 100);
      const lineTotal = Number((baseLine + itemTax).toFixed(2));

      subtotal += baseLine;
      tax += itemTax;

      return {
        ...item,
        taxRate,
        lineTotal,
      };
    });

    const total = Number((subtotal + tax).toFixed(2));

    const invoice = this.invoicesRepo.create({
      invoiceNumber,
      organizationId,
      orderId: dto.orderId || null,
      supplierId: dto.supplierId || null,
      buyerId: dto.buyerId || null,
      status: CommerceInvoiceStatus.ISSUED,
      issueDate: new Date(),
      dueDate: new Date(dto.dueDate),
      subtotal: Number(subtotal.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      total,
      amountPaid: 0,
      balanceDue: total,
      lineItems,
      notes: dto.notes || null,
    });

    return this.invoicesRepo.save(invoice);
  }

  async findAll(
    organizationId: string,
    filter?: { status?: string },
  ): Promise<CommerceInvoice[]> {
    const qb = this.invoicesRepo
      .createQueryBuilder('invoice')
      .where('invoice.organization_id = :organizationId', { organizationId });

    if (filter?.status) {
      qb.andWhere('invoice.status = :status', { status: filter.status });
    }

    qb.orderBy('invoice.created_at', 'DESC');
    return qb.getMany();
  }

  async findOne(organizationId: string, id: string): Promise<CommerceInvoice> {
    const invoice = await this.invoicesRepo.findOne({
      where: { id, organizationId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }
    return invoice;
  }

  async checkAndMarkOverdue(organizationId: string): Promise<number> {
    const now = new Date();
    const overdueCandidates = await this.invoicesRepo
      .createQueryBuilder('invoice')
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.balance_due > 0')
      .andWhere('invoice.due_date < :now', { now })
      .andWhere('invoice.status NOT IN (:...excludeStatuses)', {
        excludeStatuses: [CommerceInvoiceStatus.PAID, CommerceInvoiceStatus.VOID],
      })
      .getMany();

    let updatedCount = 0;

    for (const invoice of overdueCandidates) {
      invoice.status = CommerceInvoiceStatus.OVERDUE;
      await this.invoicesRepo.save(invoice);
      updatedCount++;

      // Trigger single active invoice_overdue signal
      await this.signalsService.createSignal({
        organizationId,
        type: SignalType.INVOICE_OVERDUE,
        sourceType: SignalSourceType.INVOICE,
        sourceId: invoice.id,
        title: 'Invoice Overdue',
        message: `Invoice #${invoice.invoiceNumber} is overdue. Outstanding balance: $${invoice.balanceDue.toFixed(2)}`,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          balanceDue: invoice.balanceDue,
          dueDate: invoice.dueDate,
        },
      });
    }

    return updatedCount;
  }

  async recordPayment(
    organizationId: string,
    invoiceId: string,
    dto: RecordPaymentDto,
  ): Promise<{ payment: CommercePayment; invoice: CommerceInvoice }> {
    const invoice = await this.findOne(organizationId, invoiceId);

    if (invoice.status === CommerceInvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already fully paid');
    }

    if (dto.amount > invoice.balanceDue + 0.01) {
      throw new BadRequestException(
        `Payment amount ($${dto.amount}) exceeds outstanding balance ($${invoice.balanceDue})`,
      );
    }

    const payment = this.paymentsRepo.create({
      organizationId,
      invoiceId: invoice.id,
      amount: Number(dto.amount.toFixed(2)),
      currency: 'USD',
      paymentMethod: dto.paymentMethod || CommercePaymentMethod.BANK_TRANSFER,
      status: CommercePaymentStatus.SUCCEEDED,
      stripePaymentIntentId: dto.stripePaymentIntentId || null,
      notes: dto.notes || null,
      paidAt: new Date(),
    });

    const savedPayment = await this.paymentsRepo.save(payment);

    // Recompute total payments made towards this invoice
    await this.recalculateInvoiceBalance(organizationId, invoice.id);
    const updatedInvoice = await this.findOne(organizationId, invoice.id);

    return { payment: savedPayment, invoice: updatedInvoice };
  }

  async refundPayment(
    organizationId: string,
    paymentId: string,
    reason?: string,
  ): Promise<CommercePayment> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId, organizationId },
    });
    if (!payment) {
      throw new NotFoundException(`Payment with ID "${paymentId}" not found`);
    }

    if (payment.status === CommercePaymentStatus.REFUNDED) {
      throw new BadRequestException('Payment has already been refunded');
    }

    payment.status = CommercePaymentStatus.REFUNDED;
    payment.refundedAt = new Date();
    payment.notes = reason ? `Refunded: ${reason}` : 'Refunded';

    const saved = await this.paymentsRepo.save(payment);

    // Recompute invoice balance
    await this.recalculateInvoiceBalance(organizationId, payment.invoiceId);

    return saved;
  }

  async recalculateInvoiceBalance(
    organizationId: string,
    invoiceId: string,
  ): Promise<CommerceInvoice> {
    const invoice = await this.findOne(organizationId, invoiceId);

    const successfulPayments = await this.paymentsRepo.find({
      where: {
        invoiceId: invoice.id,
        organizationId,
        status: CommercePaymentStatus.SUCCEEDED,
      },
    });

    const amountPaid = Number(
      successfulPayments
        .reduce((sum, p) => sum + Number(p.amount), 0)
        .toFixed(2),
    );

    const balanceDue = Number(Math.max(0, invoice.total - amountPaid).toFixed(2));

    invoice.amountPaid = amountPaid;
    invoice.balanceDue = balanceDue;

    if (balanceDue === 0 && invoice.total > 0) {
      invoice.status = CommerceInvoiceStatus.PAID;
      invoice.paidAt = new Date();

      // Auto-resolve any active invoice_overdue signal
      await this.signalsService.resolveSignal({
        organizationId,
        type: SignalType.INVOICE_OVERDUE,
        sourceType: SignalSourceType.INVOICE,
        sourceId: invoice.id,
      });
    } else if (amountPaid > 0 && balanceDue > 0) {
      invoice.status = CommerceInvoiceStatus.PARTIALLY_PAID;
      invoice.paidAt = null;
    } else {
      const now = new Date();
      if (invoice.dueDate && invoice.dueDate < now && balanceDue > 0) {
        invoice.status = CommerceInvoiceStatus.OVERDUE;
      } else {
        invoice.status = CommerceInvoiceStatus.ISSUED;
      }
      invoice.paidAt = null;
    }

    return this.invoicesRepo.save(invoice);
  }

  async getPayments(
    organizationId: string,
    invoiceId?: string,
  ): Promise<CommercePayment[]> {
    const where: any = { organizationId };
    if (invoiceId) {
      where.invoiceId = invoiceId;
    }
    return this.paymentsRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async getCashFlowAggregates(organizationId: string) {
    const invoices = await this.invoicesRepo.find({
      where: { organizationId },
    });

    const payments = await this.paymentsRepo.find({
      where: { organizationId, status: CommercePaymentStatus.SUCCEEDED },
    });

    const totalInvoiced = Number(
      invoices.reduce((sum, inv) => sum + Number(inv.total), 0).toFixed(2),
    );
    const totalPaid = Number(
      invoices.reduce((sum, inv) => sum + Number(inv.amountPaid), 0).toFixed(2),
    );
    const totalOutstanding = Number(
      invoices.reduce((sum, inv) => sum + Number(inv.balanceDue), 0).toFixed(2),
    );

    const now = new Date();
    const totalOverdue = Number(
      invoices
        .filter((inv) => inv.status === CommerceInvoiceStatus.OVERDUE || (inv.dueDate < now && inv.balanceDue > 0))
        .reduce((sum, inv) => sum + Number(inv.balanceDue), 0)
        .toFixed(2),
    );

    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      totalOverdue,
      paymentCount: payments.length,
      invoiceCount: invoices.length,
    };
  }
}
