import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany } from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';
import { SalesTransaction } from './sales-transaction.entity';
import { SalesTransactionLine } from './sales-transaction-line.entity';
import { CustomerPayment } from './customer-payment.entity';

/** Canonical customer — the revenue-side mirror of `Vendor` (QuickBooks Customer, Xero Contact, etc.). */
@Entity({ name: 'customers' })
export class Customer extends ProvenancedRecordEntity {
  @ApiProperty({ example: "Amy's Bird Sanctuary" })
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

  @OneToMany(() => SalesTransaction, (transaction) => transaction.customer)
  salesTransactions: SalesTransaction[];

  @OneToMany(() => SalesTransactionLine, (line) => line.customer)
  salesTransactionLines: SalesTransactionLine[];

  @OneToMany(() => CustomerPayment, (payment) => payment.customer)
  customerPayments: CustomerPayment[];
}
