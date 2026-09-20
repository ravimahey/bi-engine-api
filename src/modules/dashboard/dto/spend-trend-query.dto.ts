import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { toUuidArray } from '@modules/records/utils';
import { TIME_GRANULARITIES } from '../constants';
import type { TimeGranularity } from '../constants';
import { DashboardQueryDto } from './dashboard-query.dto';

/** Graph 1 — spend over time. */
export class SpendTrendQueryDto extends DashboardQueryDto {
  @ApiPropertyOptional({ enum: TIME_GRANULARITIES, default: 'month' })
  @IsOptional()
  @IsEnum(TIME_GRANULARITIES)
  granularity: TimeGranularity = 'month';

  @ApiPropertyOptional({
    type: [String],
    description: 'Comma-separated vendor ids',
  })
  @IsOptional()
  @Transform(toUuidArray)
  @IsArray()
  @IsUUID('4', { each: true })
  vendorIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Comma-separated category ids',
  })
  @IsOptional()
  @Transform(toUuidArray)
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];
}
