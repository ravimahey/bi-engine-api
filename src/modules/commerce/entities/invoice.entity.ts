import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@common/entities';

export enum CommerceInvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue',
  VOID = 'void',
}

export interface InvoiceLineItem {
  itemId?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate?: number;
  lineTotal: number;
}

@Entity({ name: 'commerce_invoices' })
@Index('idx_commerce_invoices_org_status', ['organizationId', 'status'])
@Index('idx_commerce_invoices_order', ['orderId'])
@Index('idx_commerce_invoices_due', ['organizationId', 'dueDate'])
export class CommerceInvoice extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'varchar', length: 50, name: 'invoice_number' })
  invoiceNumber: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId: string | null;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'supplier_id', nullable: true })
  supplierId: string | null;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'buyer_id', nullable: true })
  buyerId: string | null;

  @ApiProperty({ enum: CommerceInvoiceStatus })
  @Column({
    type: 'enum',
    enum: CommerceInvoiceStatus,
    default: CommerceInvoiceStatus.DRAFT,
  })
  status: CommerceInvoiceStatus;

  @ApiProperty()
  @Column({ type: 'timestamptz', name: 'issue_date', default: () => 'CURRENT_TIMESTAMP' })
  issueDate: Date;

  @ApiProperty()
  @Column({ type: 'timestamptz', name: 'due_date' })
  dueDate: Date;

  @ApiProperty({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value) || 0,
    },
  })
  subtotal: number;

  @ApiProperty({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value) || 0,
    },
  })
  tax: number;

  @ApiProperty({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value) || 0,
    },
  })
  total: number;

  @ApiProperty({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'amount_paid',
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value) || 0,
    },
  })
  amountPaid: number;

  @ApiProperty({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'balance_due',
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value) || 0,
    },
  })
  balanceDue: number;

  @ApiProperty({ type: 'jsonb', default: [] })
  @Column({ type: 'jsonb', default: [], name: 'line_items' })
  lineItems: InvoiceLineItem[];

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', nullable: true, name: 'paid_at' })
  paidAt: Date | null;
}
