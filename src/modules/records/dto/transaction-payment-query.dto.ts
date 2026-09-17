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
import { SourceSystem } from '../entities';
import { TRANSACTION_PAYMENT_SORTABLE_FIELDS } from '../constants';
import { toUuidArray } from '../utils';

/**
 * `GET /records/transaction-payments` — bill/purchase payments, filterable
 * by vendor/date. `TransactionPayment` has no free-text column, so the
 * inherited `search` param is unused here.
 */
export class TransactionPaymentQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({
    enum: TRANSACTION_PAYMENT_SORTABLE_FIELDS,
    default: 'paymentDate',
  })
  @IsOptional()
  @IsIn(TRANSACTION_PAYMENT_SORTABLE_FIELDS)
  sortBy: (typeof TRANSACTION_PAYMENT_SORTABLE_FIELDS)[number] = 'paymentDate';
}
