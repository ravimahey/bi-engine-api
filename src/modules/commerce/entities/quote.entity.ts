import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@common/entities';

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
}

export interface QuoteItem {
  itemId?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  lineTotal: number;
}

@Entity({ name: 'quotes' })
@Index('idx_quotes_org_status', ['organizationId', 'status'])
export class Quote extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'varchar', length: 50, name: 'quote_number' })
  quoteNumber: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'supplier_id', nullable: true })
  supplierId: string | null;

  @ApiProperty({ enum: QuoteStatus })
  @Column({
    type: 'enum',
    enum: QuoteStatus,
    default: QuoteStatus.DRAFT,
  })
  status: QuoteStatus;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'expiry_date', nullable: true })
  expiryDate: Date | null;

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

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId: string | null;

  @ApiProperty({ type: 'jsonb', default: [] })
  @Column({ type: 'jsonb', default: [] })
  items: QuoteItem[];
}
