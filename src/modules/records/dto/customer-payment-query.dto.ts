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
import { CUSTOMER_PAYMENT_SORTABLE_FIELDS } from '../constants';
import { toUuidArray } from '../utils';

/**
 * `GET /records/customer-payments` — the revenue-side mirror of
 * `TransactionPaymentQueryDto`, filterable by customer/date.
 * `CustomerPayment` has no free-text column, so the inherited `search` param
 * is unused here.
 */
export class CustomerPaymentQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({
    enum: CUSTOMER_PAYMENT_SORTABLE_FIELDS,
    default: 'paymentDate',
  })
  @IsOptional()
  @IsIn(CUSTOMER_PAYMENT_SORTABLE_FIELDS)
  sortBy: (typeof CUSTOMER_PAYMENT_SORTABLE_FIELDS)[number] = 'paymentDate';
}
