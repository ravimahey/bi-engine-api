import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { SalesTransactionType, SourceSystem } from '../entities';
import { SALES_TRANSACTION_SORTABLE_FIELDS } from '../constants';
import { toUuidArray } from '../utils';

/**
 * `GET /records/sales-transactions` — header-level revenue list (Invoice +
 * SalesReceipt, unified via `transactionType`), the revenue-side mirror of
 * `ExpenseTransactionQueryDto`. For line-grain filtering (category/item/tax
 * rate/amount), use `GET /records/sales-transaction-lines` instead.
 * Inherited `search` matches on `privateNote`.
 */
export class SalesTransactionQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ enum: SourceSystem })
  @IsOptional()
  @IsEnum(SourceSystem)
  sourceSystem?: SourceSystem;

  @ApiPropertyOptional({ enum: SalesTransactionType })
  @IsOptional()
  @IsEnum(SalesTransactionType)
  transactionType?: SalesTransactionType;

  @ApiPropertyOptional({
    enum: SALES_TRANSACTION_SORTABLE_FIELDS,
    default: 'transactionDate',
  })
  @IsOptional()
  @IsIn(SALES_TRANSACTION_SORTABLE_FIELDS)
  sortBy: (typeof SALES_TRANSACTION_SORTABLE_FIELDS)[number] =
    'transactionDate';
}
