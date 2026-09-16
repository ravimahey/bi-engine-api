import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany } from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';
import { ExpenseTransactionLine } from './expense-transaction-line.entity';

export enum ItemType {
  INVENTORY = 'inventory',
  NON_INVENTORY = 'non_inventory',
  SERVICE = 'service',
}

/** Canonical product/service — what turns "Materials spend went up" into "flour spend went up". */
@Entity({ name: 'items' })
export class Item extends ProvenancedRecordEntity {
  @ApiProperty({ example: 'Flour' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({ enum: ItemType })
  @Column({ type: 'enum', enum: ItemType, name: 'item_type' })
  itemType: ItemType;

  /** Provider's default/list price — a baseline to compare actual transaction unit prices against. */
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

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  /** Inverse side of `ExpenseTransactionLine.item` — not eager; fetch via `relations`/`leftJoinAndSelect` when needed. */
  @OneToMany(() => ExpenseTransactionLine, (line) => line.item)
  expenseTransactionLines: ExpenseTransactionLine[];
}
