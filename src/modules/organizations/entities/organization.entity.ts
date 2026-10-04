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

  // Business profile collected by the onboarding wizard. All nullable /
  // empty-by-default: organizations created before it (or by an admin with
  // just a name) simply have no profile yet. Allowed values and per-country
  // rules: see `../constants` and `OrganizationProfileService`.

  @ApiProperty({ example: 'Riverside Kitchen', nullable: true })
  @Column({
    type: 'varchar',
    name: 'trading_name',
    length: 255,
    nullable: true,
  })
  tradingName: string | null;

  @ApiProperty({ example: '12 345 678 901', nullable: true })
  @Column({
    type: 'varchar',
    name: 'business_number',
    length: 50,
    nullable: true,
  })
  businessNumber: string | null;

  @ApiProperty({
    example: 'AU',
    description: 'ISO 3166-1 alpha-2',
    nullable: true,
  })
  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  @ApiProperty({ example: 'VIC', nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @ApiProperty({ example: '12 Collins St', nullable: true })
  @Column({
    type: 'varchar',
    name: 'street_address',
    length: 255,
    nullable: true,
  })
  streetAddress: string | null;

  @ApiProperty({ example: 'Melbourne', nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @ApiProperty({ example: '3000', nullable: true })
  @Column({ type: 'varchar', length: 10, nullable: true })
  postcode: string | null;

  @ApiProperty({ example: 'Australia/Sydney', nullable: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @ApiProperty({ example: ['restaurant', 'cafe'], type: [String] })
  @Column({
    type: 'text',
    name: 'business_types',
    array: true,
    default: () => "'{}'",
  })
  businessTypes: string[];

  @ApiProperty({ example: '2-5', nullable: true })
  @Column({
    type: 'varchar',
    name: 'location_count',
    length: 20,
    nullable: true,
  })
  locationCount: string | null;

  @ApiProperty({ example: '50k-250k', nullable: true })
  @Column({
    type: 'varchar',
    name: 'monthly_volume',
    length: 20,
    nullable: true,
  })
  monthlyVolume: string | null;

  @ApiProperty({ example: ['reduce-costs'], type: [String] })
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  goals: string[];

  @ApiProperty({
    example: ['xero'],
    type: [String],
    description: 'Data sources picked during onboarding (intent only)',
  })
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  integrations: string[];

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
