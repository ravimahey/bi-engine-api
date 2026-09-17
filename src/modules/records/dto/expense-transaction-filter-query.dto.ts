import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { ExpenseTransactionType, SourceSystem } from '../entities';
import { EXPENSE_LINE_SORTABLE_FIELDS } from '../constants';
import { toNumber, toUuidArray } from '../utils';

/**
 * Advanced filter for `ExpenseTransactionLine` — the dimensions the guide's
 * money-leak findings actually key on (vendor/category/item spend trends),
 * plus tax rate/source/type/amount range and pagination. Consumed by
 * `RecordsFilterService`, which is also what the findings engine and "Ask
 * Ordaraa" will call once they exist, so the filter surface lives here once.
 *
 * `organizationId` stays a required, caller-supplied param (an admin needs
 * to pick which organization to look at), but `RecordsFilterService.filter`
 * validates it against the authenticated caller's own `organizationId` for
 * any non-admin — a caller can never pass another tenant's id and get data
 * back for it.
 */
export class ExpenseTransactionFilterQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

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

  @ApiPropertyOptional({
    type: [String],
    description: 'Comma-separated item ids',
  })
  @IsOptional()
  @Transform(toUuidArray)
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Comma-separated tax rate ids',
  })
  @IsOptional()
  @Transform(toUuidArray)
  @IsArray()
  @IsUUID('4', { each: true })
  taxRateIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  amountMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  amountMax?: number;

  @ApiPropertyOptional({ enum: SourceSystem })
  @IsOptional()
  @IsEnum(SourceSystem)
  sourceSystem?: SourceSystem;

  @ApiPropertyOptional({ enum: ExpenseTransactionType })
  @IsOptional()
  @IsEnum(ExpenseTransactionType)
  transactionType?: ExpenseTransactionType;

  @ApiPropertyOptional({
    enum: EXPENSE_LINE_SORTABLE_FIELDS,
    default: 'transactionDate',
  })
  @IsOptional()
  @IsIn(EXPENSE_LINE_SORTABLE_FIELDS)
  sortBy: (typeof EXPENSE_LINE_SORTABLE_FIELDS)[number] = 'transactionDate';
}
