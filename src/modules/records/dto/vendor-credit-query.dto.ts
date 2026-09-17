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
import { VENDOR_CREDIT_SORTABLE_FIELDS } from '../constants';
import { toUuidArray } from '../utils';

/**
 * `GET /records/vendor-credits` — filterable by vendor/date. `VendorCredit`
 * has no free-text column, so the inherited `search` param is unused here
 * (unlike the other list DTOs in this module, which all match it against a
 * name/note column).
 */
export class VendorCreditQueryDto extends PaginationQueryDto {
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
    enum: VENDOR_CREDIT_SORTABLE_FIELDS,
    default: 'transactionDate',
  })
  @IsOptional()
  @IsIn(VENDOR_CREDIT_SORTABLE_FIELDS)
  sortBy: (typeof VENDOR_CREDIT_SORTABLE_FIELDS)[number] = 'transactionDate';
}
