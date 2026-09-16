import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import type { ValueTransformer } from 'typeorm';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '@common/entities';
import {
  decryptToken,
  encryptToken,
  resolveTokenEncryptionKey,
} from '@common/utils';
import { Organization } from '@modules/organizations/entities';
import {
  CompanyProfile,
  Customer,
  CustomerPayment,
  ExpenseTransaction,
  Item,
  SalesTransaction,
  SpendCategory,
  TaxCode,
  TaxRate,
  TransactionPayment,
  Vendor,
  VendorCredit,
} from '@modules/records/entities';
import { SyncCursor } from './sync-cursor.entity';

export enum ProviderType {
  QUICKBOOKS = 'quickbooks',
  XERO = 'xero',
  ZOHO = 'zoho',
}

export enum ConnectionStatus {
  PENDING = 'pending',
  CONNECTED = 'connected',
  ERROR = 'error',
  DISCONNECTED = 'disconnected',
}

// Column transformers run outside Nest's DI container, so the key is read
// straight from process.env (see common/utils/token-encryption.util.ts) —
// resolved lazily, once per value, rather than at module-load time, so a
// missing key only breaks token read/write, not app boot.
const tokenTransformer: ValueTransformer = {
  to: (value?: string | null) =>
    value == null
      ? value
      : encryptToken(
          value,
          resolveTokenEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY ?? ''),
        ),
  from: (value?: string | null) =>
    value == null
      ? value
      : decryptToken(
          value,
          resolveTokenEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY ?? ''),
        ),
};

/**
 * One row per (organization, provider) — the shared connection record every
 * provider module's sync/mapper code stamps as provenance. This is the
 * generic replacement for a provider owning its own connection table:
 * `modules/quickbooks` (and later `modules/xero`) reference this by
 * `id` instead of tracking tokens themselves.
 *
 * Tokens are encrypted at rest (`tokenTransformer`) on top of the usual
 * `select: false` + `@Exclude()` double guard this codebase already uses for
 * `User.passwordHash` — encrypted so a raw DB dump doesn't hand out live
 * QuickBooks/Xero credentials, `select: false`/`@Exclude()` so they never
 * come back over a default query or serialize to a client even if selected.
 */
@Entity({ name: 'provider_connections' })
@Index(
  'idx_provider_connections_org_provider',
  ['organizationId', 'provider'],
  {
    unique: true,
  },
)
export class ProviderConnection extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Index('idx_provider_connections_organization_id')
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ApiProperty({ enum: ProviderType })
  @Column({ type: 'enum', enum: ProviderType })
  provider: ProviderType;

  /** Intuit realm id / Xero tenant id / Zoho organization id — always a string. */
  @ApiProperty({ example: '9341454816123456' })
  @Column({ type: 'varchar', length: 100, name: 'external_realm_id' })
  externalRealmId: string;

  @ApiProperty({ enum: ConnectionStatus })
  @Column({
    type: 'enum',
    enum: ConnectionStatus,
    default: ConnectionStatus.PENDING,
  })
  status: ConnectionStatus;

  @Exclude()
  @Column({
    type: 'text',
    name: 'access_token',
    nullable: true,
    select: false,
    transformer: tokenTransformer,
  })
  accessToken: string | null;

  @Exclude()
  @Column({
    type: 'text',
    name: 'refresh_token',
    nullable: true,
    select: false,
    transformer: tokenTransformer,
  })
  refreshToken: string | null;

  @Column({
    type: 'timestamptz',
    name: 'access_token_expires_at',
    nullable: true,
  })
  accessTokenExpiresAt: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'refresh_token_expires_at',
    nullable: true,
  })
  refreshTokenExpiresAt: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'connected_at', nullable: true })
  connectedAt: Date | null;

  // Inverse sides of every `source_connection_id` FK that points here
  // (canonical records/* rows). Not eager — never populated unless a query
  // explicitly asks for them via `relations`/`leftJoinAndSelect`. No
  // Quickbooks*-specific relations here: this module is provider-agnostic,
  // and QuickBooks writes straight into these canonical tables with no raw
  // intermediate layer of its own.

  @OneToMany(() => SyncCursor, (cursor) => cursor.providerConnection)
  syncCursors: SyncCursor[];

  @OneToMany(() => CompanyProfile, (profile) => profile.sourceConnection)
  companyProfiles: CompanyProfile[];

  @OneToMany(() => Vendor, (vendor) => vendor.sourceConnection)
  vendors: Vendor[];

  @OneToMany(() => SpendCategory, (category) => category.sourceConnection)
  spendCategories: SpendCategory[];

  @OneToMany(() => Item, (item) => item.sourceConnection)
  items: Item[];

  @OneToMany(() => TaxRate, (taxRate) => taxRate.sourceConnection)
  taxRates: TaxRate[];

  @OneToMany(() => TaxCode, (taxCode) => taxCode.sourceConnection)
  taxCodes: TaxCode[];

  @OneToMany(
    () => ExpenseTransaction,
    (transaction) => transaction.sourceConnection,
  )
  expenseTransactions: ExpenseTransaction[];

  @OneToMany(
    () => VendorCredit,
    (vendorCredit) => vendorCredit.sourceConnection,
  )
  vendorCredits: VendorCredit[];

  @OneToMany(() => TransactionPayment, (payment) => payment.sourceConnection)
  transactionPayments: TransactionPayment[];

  @OneToMany(() => Customer, (customer) => customer.sourceConnection)
  customers: Customer[];

  @OneToMany(
    () => SalesTransaction,
    (transaction) => transaction.sourceConnection,
  )
  salesTransactions: SalesTransaction[];

  @OneToMany(() => CustomerPayment, (payment) => payment.sourceConnection)
  customerPayments: CustomerPayment[];
}
