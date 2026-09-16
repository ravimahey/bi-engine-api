import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { ProviderConnection } from '@modules/providers/entities';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
  Item,
  SpendCategory,
  TaxRate,
  TransactionPayment,
  Vendor,
  VendorCredit,
} from '@modules/records/entities';
import { User } from '@modules/users/entities';

/**
 * The tenant. Every provider connection and every canonical spend-analytics
 * record is scoped to one organization — this is what "tenant-isolated per
 * business" (PROJECT_CONTEXT.md) actually keys on. A user self-links to one
 * of these via `User.organizationId` when they create/join it
 * (`OrganizationsService.create`) — see `OrganizationsController` for the
 * CRUD surface.
 */
@Entity({ name: 'organizations' })
export class Organization extends BaseEntity {
  @ApiProperty({ example: 'Riverside Bistro' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ example: 'riverside-bistro' })
  @Index('idx_organizations_slug', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  // Inverse sides of every module's `organization`/`organizationId` FK. Not
  // eager — TypeORM never populates these unless a query explicitly asks for
  // them via `relations`/`leftJoinAndSelect`, so they add no query cost and
  // no serialization risk to the existing find-by-id/list endpoints.

  @OneToMany(() => ProviderConnection, (connection) => connection.organization)
  providerConnections: ProviderConnection[];

  @OneToMany(() => Vendor, (vendor) => vendor.organization)
  vendors: Vendor[];

  @OneToMany(() => SpendCategory, (category) => category.organization)
  spendCategories: SpendCategory[];

  @OneToMany(() => Item, (item) => item.organization)
  items: Item[];

  @OneToMany(() => TaxRate, (taxRate) => taxRate.organization)
  taxRates: TaxRate[];

  @OneToMany(
    () => ExpenseTransaction,
    (transaction) => transaction.organization,
  )
  expenseTransactions: ExpenseTransaction[];

  @OneToMany(() => ExpenseTransactionLine, (line) => line.organization)
  expenseTransactionLines: ExpenseTransactionLine[];

  @OneToMany(() => VendorCredit, (vendorCredit) => vendorCredit.organization)
  vendorCredits: VendorCredit[];

  @OneToMany(() => TransactionPayment, (payment) => payment.organization)
  transactionPayments: TransactionPayment[];

  @OneToMany(() => User, (user) => user.organization)
  users: User[];
}
