import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';
import { Vendor } from './vendor.entity';

/**
 * Canonical payment record — when a bill/purchase was actually paid, not
 * just recorded: the gap between "Reported" and "Observed" value the AI
 * guardrails keep separate. `appliedTransactions` is a denormalized JSONB
 * array of `{ expenseTransactionExternalId, amount }` (one payment can
 * settle several bills) rather than a join table, for the same reason as
 * `VendorCredit.lines`.
 */
@Entity({ name: 'transaction_payments' })
@Index('idx_transaction_payments_org_date', ['organizationId', 'paymentDate'])
export class TransactionPayment extends ProvenancedRecordEntity {
  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'vendor_id', nullable: true })
  vendorId: string | null;

  @ManyToOne(() => Vendor, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor | null;

  @ApiProperty({ example: '2026-08-16' })
  @Column({ type: 'date', name: 'payment_date' })
  paymentDate: string;

  @ApiProperty({ example: 103.55 })
  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'total_amount' })
  totalAmount: string;

  @ApiProperty({ example: 'USD' })
  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;

  @ApiProperty({ required: false, nullable: true, example: 'Check' })
  @Column({
    type: 'varchar',
    length: 50,
    name: 'payment_method',
    nullable: true,
  })
  paymentMethod: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Denormalized applied-to detail: [{ expenseTransactionExternalId, amount }]',
  })
  @Column({ type: 'jsonb', name: 'applied_transactions', nullable: true })
  appliedTransactions: unknown[] | null;
}
