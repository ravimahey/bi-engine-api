import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';
import { Vendor } from './vendor.entity';

/**
 * Canonical vendor credit — nets a supplier refund against the spend it
 * originally hit, so an overcharge-then-credit doesn't read as a genuine
 * spend increase. `lines` is a denormalized JSONB array of
 * `{ categoryExternalId, itemExternalId, amount, taxCodeExternalRef }`
 * rather than a dedicated child table, keeping this within the canonical
 * entity set this schema was scoped to while still preserving enough detail
 * for the findings engine to net a credit against the right category/item.
 * A relational `VendorCreditLine` table (mirroring `ExpenseTransactionLine`)
 * is a reasonable follow-up if credits need that same query power.
 */
@Entity({ name: 'vendor_credits' })
@Index('idx_vendor_credits_org_date', ['organizationId', 'transactionDate'])
export class VendorCredit extends ProvenancedRecordEntity {
  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'vendor_id', nullable: true })
  vendorId: string | null;

  @ManyToOne(() => Vendor, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor | null;

  @ApiProperty({ example: '2026-08-13' })
  @Column({ type: 'date', name: 'transaction_date' })
  transactionDate: string;

  @ApiProperty({ example: 90.0 })
  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'total_amount' })
  totalAmount: string;

  @ApiProperty({ example: 'USD' })
  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Denormalized line detail: [{ categoryExternalId, itemExternalId, amount, taxCodeExternalRef }]',
  })
  @Column({ type: 'jsonb', nullable: true })
  lines: unknown[] | null;
}
