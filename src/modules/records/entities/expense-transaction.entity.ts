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
import { Vendor } from './vendor.entity';
import { ExpenseTransactionLine } from './expense-transaction-line.entity';

export enum ExpenseTransactionType {
  BILL = 'bill',
  PURCHASE = 'purchase',
}

/**
 * Canonical spend-transaction header — unifies QuickBooks Bill (AP workflow)
 * and Purchase (card/cash, never billed) behind one `transactionType` so the
 * findings engine queries one table instead of branching per provider
 * concept. Line-item detail (the actual money-leak signal) lives in
 * `ExpenseTransactionLine`; this header is what a basic transaction list/
 * pagination endpoint queries without needing the line grain.
 */
@Entity({ name: 'expense_transactions' })
@Index('idx_expense_transactions_org_date', [
  'organizationId',
  'transactionDate',
])
export class ExpenseTransaction extends ProvenancedRecordEntity {
  @ApiProperty({ enum: ExpenseTransactionType })
  @Column({
    type: 'enum',
    enum: ExpenseTransactionType,
    name: 'transaction_type',
  })
  transactionType: ExpenseTransactionType;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'vendor_id', nullable: true })
  vendorId: string | null;

  @ManyToOne(() => Vendor, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor | null;

  @ApiProperty({ example: '2026-08-16' })
  @Column({ type: 'date', name: 'transaction_date' })
  transactionDate: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate: string | null;

  @ApiProperty({ example: 205.0 })
  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'total_amount' })
  totalAmount: string;

  @ApiProperty({ example: 'USD' })
  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;

  /** Outstanding amount still owed on this transaction, when the provider reports one. */
  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  balance: string | null;

  /** Purchase.PaymentType (Cash/Check/CreditCard) — null for Bills, which pay through AP instead. */
  @ApiProperty({ required: false, nullable: true })
  @Column({
    type: 'varchar',
    length: 50,
    name: 'payment_method',
    nullable: true,
  })
  paymentMethod: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', name: 'private_note', nullable: true })
  privateNote: string | null;

  /** Inverse side of `ExpenseTransactionLine.transaction` — not eager; fetch via `relations`/`leftJoinAndSelect` when needed. */
  @OneToMany(() => ExpenseTransactionLine, (line) => line.transaction)
  lines: ExpenseTransactionLine[];
}
