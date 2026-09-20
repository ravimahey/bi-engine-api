import { ApiProperty } from '@nestjs/swagger';

export class SpendPeriodDto {
  @ApiProperty({ example: 11000.0 })
  totalSpend: number;

  @ApiProperty({ example: 220 })
  totalQty: number;
}

/**
 * A cost-increase finding: two already-computed period totals plus the
 * comparison between them. `driver` distinguishes "spend rose because
 * quantity rose" (volume-driven — not a supplier problem) from "spend rose
 * while quantity held steady" (price-driven — the actual money-leak
 * signal), per the "don't call volume growth a savings opportunity" rule.
 * `isFinding` is true only when the increase clears
 * `SPEND_CHANGE_FINDING_THRESHOLD_PERCENT`.
 */
export class SpendChangeDto {
  @ApiProperty({ type: SpendPeriodDto })
  current: SpendPeriodDto;

  @ApiProperty({ type: SpendPeriodDto })
  prior: SpendPeriodDto;

  @ApiProperty({ example: 3000.0 })
  spendChange: number;

  @ApiProperty({ nullable: true, example: 37.5 })
  spendChangePercent: number | null;

  @ApiProperty({ example: 10 })
  qtyChange: number;

  @ApiProperty({ nullable: true, example: 4.76 })
  qtyChangePercent: number | null;

  @ApiProperty({ enum: ['price', 'volume', 'mixed', 'none', 'unknown'] })
  driver: 'price' | 'volume' | 'mixed' | 'none' | 'unknown';

  @ApiProperty({ example: true })
  isFinding: boolean;
}
