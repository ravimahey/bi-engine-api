import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { Organization } from '@modules/organizations/entities';
import { ExpenseTransaction } from './expense-transaction.entity';
import { Vendor } from './vendor.entity';
import { SpendCategory } from './spend-category.entity';
import { Item } from './item.entity';
import { TaxRate } from './tax-rate.entity';

/**
 * Line-item grain — the actual money-leak signal (per the build-order guide:
 * "store these at line-item grain, not just the bill total, or you lose the
 * ability to isolate price vs volume"). `organizationId`/`vendorId`/
 * `transactionDate` are intentionally denormalized copies of the parent
 * `ExpenseTransaction`'s own columns: category/item/tax-rate filtering only
 * makes sense at this grain, so the hottest findings-engine query shapes
 * ("category/item/vendor spend this month vs last") run entirely off this
 * table's own composite indexes instead of joining up to the header for
 * every row. `QuickbooksRecordMapperService` is the only writer, so keeping
 * the copy in sync is a write-time invariant, not a runtime one.
 */
@Entity({ name: 'expense_transaction_lines' })
@Index(['transactionId', 'externalLineId'], { unique: true })
// Query shape: "spend for org X between date A and B" (dashboard/KPI totals).
@Index('idx_expense_transaction_lines_org_date', [
  'organizationId',
  'transactionDate',
])
// Query shape: "this vendor's spend trend" — the core "supplier spend +25%" finding.
@Index('idx_expense_transaction_lines_org_vendor_date', [
  'organizationId',
  'vendorId',
  'transactionDate',
])
// Query shape: "this category's spend trend" — category-level shift findings.
@Index('idx_expense_transaction_lines_org_category_date', [
  'organizationId',
  'categoryId',
  'transactionDate',
])
// Query shape: "this item's unit-price trend" — e.g. "flour spend went up".
@Index('idx_expense_transaction_lines_org_item_date', [
  'organizationId',
  'itemId',
  'transactionDate',
])
export class ExpenseTransactionLine extends BaseEntity {
  // Covered by the (transactionId, externalLineId) unique index above via
  // its leftmost-prefix — no separate single-column index needed.
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'transaction_id' })
  transactionId: string;

  @ManyToOne(() => ExpenseTransaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: ExpenseTransaction;

  /** QuickBooks Line.Id — scoped to the parent transaction, not globally unique. */
  @ApiProperty({ example: '1' })
  @Column({ type: 'varchar', length: 100, name: 'external_line_id' })
  externalLineId: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

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

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'category_id', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => SpendCategory, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: SpendCategory | null;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'item_id', nullable: true })
  itemId: string | null;

  @ManyToOne(() => Item, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: Item | null;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'tax_rate_id', nullable: true })
  taxRateId: string | null;

  @ManyToOne(() => TaxRate, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tax_rate_id' })
  taxRate: TaxRate | null;

  /** Raw provider tax code (e.g. QuickBooks "TAX"/"NON") for lines that don't resolve to a mapped TaxRate. */
  @ApiProperty({ required: false, nullable: true })
  @Column({
    type: 'varchar',
    length: 50,
    name: 'tax_code_external_ref',
    nullable: true,
  })
  taxCodeExternalRef: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'int', name: 'line_number', nullable: true })
  lineNumber: number | null;

  @ApiProperty({ example: 125.0 })
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true })
  quantity: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 4,
    name: 'unit_price',
    nullable: true,
  })
  unitPrice: string | null;

  @ApiProperty({ example: 'USD' })
  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;
}
