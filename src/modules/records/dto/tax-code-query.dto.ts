import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { TAX_CODE_SORTABLE_FIELDS } from '../constants';

/**
 * `GET /records/tax-codes` — list the canonical tax codes. Each row already
 * carries its resolved `primaryPurchaseTaxRateId`/`primarySalesTaxRateId`
 * (resolved once by the mapper at sync time — see `TaxCode`), so no extra
 * join/param is needed to surface them. Inherited `search` matches on `name`.
 */
export class TaxCodeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiPropertyOptional({ enum: TAX_CODE_SORTABLE_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(TAX_CODE_SORTABLE_FIELDS)
  sortBy: (typeof TAX_CODE_SORTABLE_FIELDS)[number] = 'name';
}
