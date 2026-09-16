import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany } from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';
import { ExpenseTransaction } from './expense-transaction.entity';
import { ExpenseTransactionLine } from './expense-transaction-line.entity';
import { VendorCredit } from './vendor-credit.entity';
import { TransactionPayment } from './transaction-payment.entity';

/** Canonical supplier — the provider-agnostic mirror of QuickBooks Vendor, Xero Contact, etc. */
@Entity({ name: 'vendors' })
export class Vendor extends ProvenancedRecordEntity {
  @ApiProperty({ example: 'Norton Lumber and Building Materials' })
  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  displayName: string;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  balance: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  // Inverse sides below are not eager; fetch via `relations`/`leftJoinAndSelect` when needed.

  @OneToMany(() => ExpenseTransaction, (transaction) => transaction.vendor)
  expenseTransactions: ExpenseTransaction[];

  @OneToMany(() => ExpenseTransactionLine, (line) => line.vendor)
  expenseTransactionLines: ExpenseTransactionLine[];

  @OneToMany(() => VendorCredit, (vendorCredit) => vendorCredit.vendor)
  vendorCredits: VendorCredit[];

  @OneToMany(() => TransactionPayment, (payment) => payment.vendor)
  transactionPayments: TransactionPayment[];
}
