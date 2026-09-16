import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';
import { Customer } from './customer.entity';
import { SalesTransactionLine } from './sales-transaction-line.entity';

export enum SalesTransactionType {
  INVOICE = 'invoice',
  SALES_RECEIPT = 'sales_receipt',
}

/**
 * Canonical revenue-transaction header — unifies QuickBooks Invoice (AR
 * workflow) and SalesReceipt (point-of-sale, paid on the spot) behind one
 * `transactionType`, the revenue-side mirror of `ExpenseTransaction`. Line
 * detail lives in `SalesTransactionLine`.
 */
@Entity({ name: 'sales_transactions' })
@Index('idx_sales_transactions_org_date', ['organizationId', 'transactionDate'])
export class SalesTransaction extends ProvenancedRecordEntity {
  @ApiProperty({ enum: SalesTransactionType })
  @Column({
    type: 'enum',
    enum: SalesTransactionType,
    name: 'transaction_type',
  })
  transactionType: SalesTransactionType;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'customer_id', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @ApiProperty({ example: '2026-08-16' })
  @Column({ type: 'date', name: 'transaction_date' })
  transactionDate: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate: string | null;

  @ApiProperty({ example: 335.25 })
  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'total_amount' })
  totalAmount: string;

  @ApiProperty({ example: 'USD' })
  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;

  /** Outstanding amount still owed on this transaction, when the provider reports one. */
  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  balance: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', name: 'private_note', nullable: true })
  privateNote: string | null;

  /** Inverse side of `SalesTransactionLine.transaction` — not eager; fetch via `relations`/`leftJoinAndSelect` when needed. */
  @OneToMany(() => SalesTransactionLine, (line) => line.transaction)
  lines: SalesTransactionLine[];
}
