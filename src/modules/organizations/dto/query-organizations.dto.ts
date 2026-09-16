import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';

/** Whitelisted sort columns — never interpolate raw user input into ORDER BY. */
export const ORGANIZATION_SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'slug',
] as const;
export type OrganizationSortField =
  (typeof ORGANIZATION_SORTABLE_FIELDS)[number];

export class QueryOrganizationsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: ORGANIZATION_SORTABLE_FIELDS,
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(ORGANIZATION_SORTABLE_FIELDS)
  sortBy: OrganizationSortField = 'createdAt';
}
