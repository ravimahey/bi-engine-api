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
import { SalesTransactionType, SourceSystem } from '../entities';
import { SALES_LINE_SORTABLE_FIELDS } from '../constants';
import { toNumber, toUuidArray } from '../utils';

/**
 * `GET /records/sales-transaction-lines` — line-grain filter over
 * `SalesTransactionLine`, mirroring `ExpenseTransactionFilterQueryDto`
 * exactly (customer/category/item/tax rate/amount range/date/pagination).
 * Consumed by `RecordsRevenueFilterService`, the revenue-side sibling of
 * `RecordsFilterService`.
 *
 * `organizationId` stays a required, caller-supplied param (an admin needs
 * to pick which organization to look at), but
 * `RecordsRevenueFilterService.filter` validates it against the
 * authenticated caller's own `organizationId` for any non-admin.
 */
export class SalesTransactionLineQueryDto extends PaginationQueryDto {
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
    description: 'Comma-separated customer ids',
  })
  @IsOptional()
  @Transform(toUuidArray)
  @IsArray()
  @IsUUID('4', { each: true })
  customerIds?: string[];

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

  @ApiPropertyOptional({ enum: SalesTransactionType })
  @IsOptional()
  @IsEnum(SalesTransactionType)
  transactionType?: SalesTransactionType;

  @ApiPropertyOptional({
    enum: SALES_LINE_SORTABLE_FIELDS,
    default: 'transactionDate',
  })
  @IsOptional()
  @IsIn(SALES_LINE_SORTABLE_FIELDS)
  sortBy: (typeof SALES_LINE_SORTABLE_FIELDS)[number] = 'transactionDate';
}
