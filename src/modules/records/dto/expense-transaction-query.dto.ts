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
import { ExpenseTransactionType, SourceSystem } from '../entities';
import { EXPENSE_TRANSACTION_SORTABLE_FIELDS } from '../constants';
import { toUuidArray } from '../utils';

/**
 * `GET /records/expense-transactions` — header-level spend list (Bill +
 * Purchase, unified via `transactionType`). For line-grain filtering
 * (category/item/tax rate/amount), use `GET /records/expense-transaction-lines`
 * instead. Inherited `search` matches on `privateNote`.
 */
export class ExpenseTransactionQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ enum: SourceSystem })
  @IsOptional()
  @IsEnum(SourceSystem)
  sourceSystem?: SourceSystem;

  @ApiPropertyOptional({ enum: ExpenseTransactionType })
  @IsOptional()
  @IsEnum(ExpenseTransactionType)
  transactionType?: ExpenseTransactionType;

  @ApiPropertyOptional({
    enum: EXPENSE_TRANSACTION_SORTABLE_FIELDS,
    default: 'transactionDate',
  })
  @IsOptional()
  @IsIn(EXPENSE_TRANSACTION_SORTABLE_FIELDS)
  sortBy: (typeof EXPENSE_TRANSACTION_SORTABLE_FIELDS)[number] =
    'transactionDate';
}
