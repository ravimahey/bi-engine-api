import { ApiProperty } from '@nestjs/swagger';
import { BREAKDOWN_GROUPS, TIME_GRANULARITIES } from '../constants';
import type { BreakdownGroup, TimeGranularity } from '../constants';

export class SpendTrendPointDto {
  @ApiProperty({
    example: '2026-07-01',
    description: 'Start date of the bucket',
  })
  period: string;

  @ApiProperty({ example: 14210.0 })
  totalSpend: number;

  @ApiProperty({ example: 97 })
  lineCount: number;
}

export class SpendTrendDto {
  @ApiProperty({ enum: TIME_GRANULARITIES })
  granularity: TimeGranularity;

  @ApiProperty({ type: [SpendTrendPointDto] })
  points: SpendTrendPointDto[];
}

export class SpendBreakdownRowDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  id: string | null;

  @ApiProperty({ example: 'Norton Lumber' })
  name: string;

  @ApiProperty({ example: 12400.0 })
  totalSpend: number;

  @ApiProperty({ example: 25.7 })
  sharePct: number;

  @ApiProperty({ example: 31 })
  lineCount: number;
}

export class SpendBreakdownDto {
  @ApiProperty({ enum: BREAKDOWN_GROUPS })
  groupBy: BreakdownGroup;

  @ApiProperty({ example: 48200.0 })
  total: number;

  @ApiProperty({ type: [SpendBreakdownRowDto] })
  rows: SpendBreakdownRowDto[];
}

export class RevenueVsSpendPointDto {
  @ApiProperty({ example: '2026-07-01' })
  period: string;

  @ApiProperty({ example: 31000.0 })
  revenue: number;

  @ApiProperty({ example: 14210.0 })
  spend: number;

  @ApiProperty({ example: 16790.0 })
  net: number;
}

export class RevenueVsSpendDto {
  @ApiProperty({ enum: TIME_GRANULARITIES })
  granularity: TimeGranularity;

  @ApiProperty({ type: [RevenueVsSpendPointDto] })
  points: RevenueVsSpendPointDto[];
}
