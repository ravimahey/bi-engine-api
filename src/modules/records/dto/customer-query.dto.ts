import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { CUSTOMER_SORTABLE_FIELDS } from '../constants';

/**
 * `GET /records/customers` — revenue-side mirror of `VendorQueryDto`.
 * Inherited `search` matches on `displayName`.
 */
export class CustomerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: CUSTOMER_SORTABLE_FIELDS,
    default: 'displayName',
  })
  @IsOptional()
  @IsIn(CUSTOMER_SORTABLE_FIELDS)
  sortBy: (typeof CUSTOMER_SORTABLE_FIELDS)[number] = 'displayName';
}
