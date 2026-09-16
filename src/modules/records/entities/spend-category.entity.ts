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

/**
 * Canonical category bucket — mirrors QuickBooks' chart-of-accounts Account
 * (any classification, not filtered to Expense/COGS here; narrowing to
 * spend-relevant categories is a query-time concern for the findings engine,
 * not a schema one) and will mirror Xero's account/category model the same way.
 */
@Entity({ name: 'spend_categories' })
export class SpendCategory extends ProvenancedRecordEntity {
  @ApiProperty({ example: 'Materials' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({
    type: 'varchar',
    length: 500,
    name: 'fully_qualified_name',
    nullable: true,
  })
  fullyQualifiedName: string | null;

  /**
   * Provider-reported classification (e.g. QuickBooks AccountType: "Expense",
   * "Bank", "Credit Card") — kept as a plain string rather than a fixed enum
   * since each provider's own taxonomy differs.
   */
  @ApiProperty({ required: false, nullable: true })
  @Column({
    type: 'varchar',
    length: 100,
    name: 'category_type',
    nullable: true,
  })
  categoryType: string | null;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Index()
  @Column({ type: 'uuid', name: 'parent_category_id', nullable: true })
  parentCategoryId: string | null;

  @ManyToOne(() => SpendCategory, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parent_category_id' })
  parentCategory: SpendCategory | null;

  /** Inverse side of `parentCategory` — not eager; fetch via `relations`/`leftJoinAndSelect` when needed. */
  @OneToMany(() => SpendCategory, (category) => category.parentCategory)
  children: SpendCategory[];

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}
