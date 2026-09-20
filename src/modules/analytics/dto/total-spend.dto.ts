import { ApiProperty } from '@nestjs/swagger';

/** Response shape for the "Total Spend" KPI — one SUM/COUNT over the whole date range. */
export class TotalSpendDto {
  @ApiProperty({ example: 18420.5 })
  totalSpend: number;

  @ApiProperty({ example: 214 })
  lineCount: number;
}
