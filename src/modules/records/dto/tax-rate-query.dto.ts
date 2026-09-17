import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { TAX_RATE_SORTABLE_FIELDS } from '../constants';

/** `GET /records/tax-rates` — list the canonical tax rates. Inherited `search` matches on `name`. */
export class TaxRateQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiPropertyOptional({ enum: TAX_RATE_SORTABLE_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(TAX_RATE_SORTABLE_FIELDS)
  sortBy: (typeof TAX_RATE_SORTABLE_FIELDS)[number] = 'name';
}
