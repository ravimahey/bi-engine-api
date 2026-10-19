import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@common/entities';

export enum OrderStatus {
  SUBMITTED = 'submitted',
  READY_TO_PACK = 'ready_to_pack',
  PENDING_ADJUSTMENT = 'pending_adjustment',
  CONFIRMED = 'confirmed',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

export enum AdjustmentStatus {
  NONE = 'none',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  REJECTED = 'rejected',
}

export interface OrderItem {
  itemId?: string;
  description: string;
  requestedQuantity: number;
  packedQuantity?: number | null;
  unit: string;
  unitPrice: number;
  taxRate?: number;
  lineTotal: number;
  adjustedLineTotal?: number | null;
}

@Entity({ name: 'commerce_orders' })
@Index('idx_commerce_orders_org_status', ['organizationId', 'status'])
@Index('idx_commerce_orders_quote', ['quoteId'])
export class CommerceOrder extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'varchar', length: 50, name: 'order_number' })
  orderNumber: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'supplier_id', nullable: true })
  supplierId: string | null;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'buyer_id', nullable: true })
  buyerId: string | null;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'quote_id', nullable: true })
  quoteId: string | null;

  @ApiProperty({ enum: OrderStatus })
  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.SUBMITTED,
  })
  status: OrderStatus;

  @ApiProperty({ enum: AdjustmentStatus })
  @Column({
    type: 'enum',
    enum: AdjustmentStatus,
    default: AdjustmentStatus.NONE,
    name: 'adjustment_status',
  })
  adjustmentStatus: AdjustmentStatus;

  @ApiProperty({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'requested_total',
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value) || 0,
    },
  })
  requestedTotal: number;

  @ApiProperty({ type: 'decimal', precision: 12, scale: 2, required: false, nullable: true })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'adjusted_total',
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | number | null) => (value !== null && value !== undefined ? Number(value) : null),
    },
  })
  adjustedTotal: number | null;

  @ApiProperty({ type: 'decimal', precision: 12, scale: 2, required: false, nullable: true })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'final_total',
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | number | null) => (value !== null && value !== undefined ? Number(value) : null),
    },
  })
  finalTotal: number | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', nullable: true, name: 'adjustment_reason' })
  adjustmentReason: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', nullable: true, name: 'packed_at' })
  packedAt: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', nullable: true, name: 'confirmed_at' })
  confirmedAt: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ApiProperty({ type: 'jsonb', default: [] })
  @Column({ type: 'jsonb', default: [] })
  items: OrderItem[];
}
