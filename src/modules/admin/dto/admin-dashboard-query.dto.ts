import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { TIME_GRANULARITIES } from '@common/constants';
import type { TimeGranularity } from '@common/constants';

/**
 * Platform-wide dashboard query. Unlike `DashboardQueryDto` there is no
 * `organizationId` — every figure spans every organization — and the date
 * range only bounds the growth trends (the snapshot totals are always
 * "right now"), so both dates are optional: the service defaults to the
 * trailing 12 months when either is omitted.
 */
export class AdminDashboardQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-21' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: TIME_GRANULARITIES, default: 'month' })
  @IsOptional()
  @IsEnum(TIME_GRANULARITIES)
  granularity: TimeGranularity = 'month';
}
