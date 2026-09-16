import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';
import { Customer } from './customer.entity';

/**
 * Canonical customer payment — when an invoice was actually paid, the
 * revenue-side mirror of `TransactionPayment`. `appliedTransactions` is a
 * denormalized JSONB array of `{ salesTransactionExternalId, amount }` (one
 * payment can settle several invoices), same reasoning as
 * `TransactionPayment.appliedTransactions`.
 */
@Entity({ name: 'customer_payments' })
@Index('idx_customer_payments_org_date', ['organizationId', 'paymentDate'])
export class CustomerPayment extends ProvenancedRecordEntity {
  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'customer_id', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @ApiProperty({ example: '2026-08-16' })
  @Column({ type: 'date', name: 'payment_date' })
  paymentDate: string;

  @ApiProperty({ example: 103.55 })
  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'total_amount' })
  totalAmount: string;

  @ApiProperty({ example: 'USD' })
  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Denormalized applied-to detail: [{ salesTransactionExternalId, amount }]',
  })
  @Column({ type: 'jsonb', name: 'applied_transactions', nullable: true })
  appliedTransactions: unknown[] | null;
}
