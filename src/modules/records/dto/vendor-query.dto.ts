import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { VENDOR_SORTABLE_FIELDS } from '../constants';

/**
 * `GET /records/vendors` — list/search the canonical supplier master data.
 * `organizationId` is a required, caller-supplied param (an admin needs to
 * pick which organization to look at); `RecordsQueryService.findVendors`
 * validates it against the authenticated caller's own `organizationId` for
 * any non-admin. Inherited `search` matches on `displayName`.
 */
export class VendorQueryDto extends PaginationQueryDto {
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
    enum: VENDOR_SORTABLE_FIELDS,
    default: 'displayName',
  })
  @IsOptional()
  @IsIn(VENDOR_SORTABLE_FIELDS)
  sortBy: (typeof VENDOR_SORTABLE_FIELDS)[number] = 'displayName';
}
