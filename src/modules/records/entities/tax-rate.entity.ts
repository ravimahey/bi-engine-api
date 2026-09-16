import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany } from 'typeorm';
import { ProvenancedRecordEntity } from './provenanced-record.entity';
import { ExpenseTransactionLine } from './expense-transaction-line.entity';

/** Canonical tax rate — kept separate from line amounts so a rate change never masquerades as a price increase. */
@Entity({ name: 'tax_rates' })
export class TaxRate extends ProvenancedRecordEntity {
  @ApiProperty({ example: 'California' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ example: 8.0 })
  @Column({ type: 'numeric', precision: 7, scale: 4, name: 'rate_percent' })
  ratePercent: string;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  /** Inverse side of `ExpenseTransactionLine.taxRate` — not eager; fetch via `relations`/`leftJoinAndSelect` when needed. */
  @OneToMany(() => ExpenseTransactionLine, (line) => line.taxRate)
  expenseTransactionLines: ExpenseTransactionLine[];
}
