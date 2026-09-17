import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { SPEND_CATEGORY_SORTABLE_FIELDS } from '../constants';

/**
 * `GET /records/categories` — returns the flat, paginated list with each
 * row's own `parentCategoryId`; the frontend nests it into a tree client-side
 * rather than the API building the tree server-side. `parentCategoryId`
 * narrows the list to the direct children of one category when passed.
 * Inherited `search` matches on `name`.
 */
export class SpendCategoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Return only the direct children of this category (omit for every category)',
  })
  @IsOptional()
  @IsUUID('4')
  parentCategoryId?: string;

  @ApiPropertyOptional({
    enum: SPEND_CATEGORY_SORTABLE_FIELDS,
    default: 'name',
  })
  @IsOptional()
  @IsIn(SPEND_CATEGORY_SORTABLE_FIELDS)
  sortBy: (typeof SPEND_CATEGORY_SORTABLE_FIELDS)[number] = 'name';
}
