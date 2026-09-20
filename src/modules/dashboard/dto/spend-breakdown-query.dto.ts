import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { toNumber, toUuidArray } from '@modules/records/utils';
import {
  BREAKDOWN_GROUPS,
  DEFAULT_BREAKDOWN_LIMIT,
  MAX_BREAKDOWN_LIMIT,
} from '../constants';
import type { BreakdownGroup } from '../constants';
import { DashboardQueryDto } from './dashboard-query.dto';

/** Graph 2 — top vendors / categories by spend. */
export class SpendBreakdownQueryDto extends DashboardQueryDto {
  @ApiPropertyOptional({ enum: BREAKDOWN_GROUPS, default: 'vendor' })
  @IsOptional()
  @IsEnum(BREAKDOWN_GROUPS)
  groupBy: BreakdownGroup = 'vendor';

  @ApiPropertyOptional({
    default: DEFAULT_BREAKDOWN_LIMIT,
    maximum: MAX_BREAKDOWN_LIMIT,
    description: 'Top-N rows; the remainder is rolled into an "Other" row',
  })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(MAX_BREAKDOWN_LIMIT)
  limit: number = DEFAULT_BREAKDOWN_LIMIT;

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
