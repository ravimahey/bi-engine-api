import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { SupportRequestStatus } from '../entities';

export const SUPPORT_REQUEST_SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'reviewedAt',
] as const;
export type SupportRequestSortField =
  (typeof SUPPORT_REQUEST_SORTABLE_FIELDS)[number];

export class QuerySupportRequestsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SupportRequestStatus })
  @IsOptional()
  @IsEnum(SupportRequestStatus)
  status?: SupportRequestStatus;

  @ApiPropertyOptional({
    enum: SUPPORT_REQUEST_SORTABLE_FIELDS,
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(SUPPORT_REQUEST_SORTABLE_FIELDS)
  sortBy: SupportRequestSortField = 'createdAt';
}
