import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@common/entities';

export enum CommercePaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum CommercePaymentMethod {
  STRIPE = 'stripe',
  BANK_TRANSFER = 'bank_transfer',
  CREDIT_CARD = 'credit_card',
  CASH = 'cash',
  OTHER = 'other',
}

@Entity({ name: 'commerce_payments' })
@Index('idx_commerce_payments_invoice', ['invoiceId'])
@Index('idx_commerce_payments_org', ['organizationId', 'status'])
export class CommercePayment extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'invoice_id' })
  invoiceId: string;

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
  amount: number;

  @ApiProperty({ default: 'USD' })
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @ApiProperty({ enum: CommercePaymentMethod })
  @Column({
    type: 'enum',
    enum: CommercePaymentMethod,
    default: CommercePaymentMethod.BANK_TRANSFER,
    name: 'payment_method',
  })
  paymentMethod: CommercePaymentMethod;

  @ApiProperty({ enum: CommercePaymentStatus })
  @Column({
    type: 'enum',
    enum: CommercePaymentStatus,
    default: CommercePaymentStatus.PENDING,
  })
  status: CommercePaymentStatus;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'stripe_payment_intent_id' })
  stripePaymentIntentId: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'stripe_charge_id' })
  stripeChargeId: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', nullable: true, name: 'receipt_url' })
  receiptUrl: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', nullable: true, name: 'paid_at' })
  paidAt: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', nullable: true, name: 'refunded_at' })
  refundedAt: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', nullable: true, name: 'failure_reason' })
  failureReason: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
