import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { ITEM_SORTABLE_FIELDS } from '../constants';

/**
 * `GET /records/items` — list/search the canonical product/service master
 * data. Inherited `search` matches on `name`.
 */
export class ItemQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ enum: ITEM_SORTABLE_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(ITEM_SORTABLE_FIELDS)
  sortBy: (typeof ITEM_SORTABLE_FIELDS)[number] = 'name';
}
