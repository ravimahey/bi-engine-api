import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';
import { TaxRate } from './tax-rate.entity';

/**
 * Canonical tax code — Step 4 of the build order, the label every
 * expense/sales transaction line's `TaxCodeRef` points to (e.g. "TAX",
 * "California"). A code can carry several rate entries (e.g. combined
 * state + city tax), split between a purchase-side rate and a sales-side
 * rate; only the first rate of each side is kept as "primary" since a
 * transaction line has a single `taxRateId` — a documented simplification,
 * not data loss (the line's raw `TaxCodeRef` is always preserved separately
 * via `taxCodeExternalRef`).
 *
 * Unlike a raw provider mirror, both rate references here are already
 * resolved canonical `TaxRate` ids — the mapper resolves them once at sync
 * time (same "mapper resolves, this table just stores the resolved id"
 * pattern `SpendCategory.parentCategoryId` uses), so any transaction line
 * needing a tax rate just follows this table's own FK, no external-id
 * lookup required downstream.
 */
@Entity({ name: 'tax_codes' })
export class TaxCode extends ProvenancedRecordEntity {
  @ApiProperty({ example: 'California' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', default: false })
  taxable: boolean;

  @ApiProperty({ example: false })
  @Column({ type: 'boolean', name: 'tax_group', default: false })
  taxGroup: boolean;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({
    type: 'uuid',
    name: 'primary_purchase_tax_rate_id',
    nullable: true,
  })
  primaryPurchaseTaxRateId: string | null;

  @ManyToOne(() => TaxRate, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'primary_purchase_tax_rate_id' })
  primaryPurchaseTaxRate: TaxRate | null;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({
    type: 'uuid',
    name: 'primary_sales_tax_rate_id',
    nullable: true,
  })
  primarySalesTaxRateId: string | null;

  @ManyToOne(() => TaxRate, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'primary_sales_tax_rate_id' })
  primarySalesTaxRate: TaxRate | null;
}
