import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';
import { UserRole } from '../entities/user.entity';

/** Whitelisted sort columns — never interpolate raw user input into ORDER BY. */
export const USER_SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'email',
  'firstName',
] as const;
export type UserSortField = (typeof USER_SORTABLE_FIELDS)[number];

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: USER_SORTABLE_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(USER_SORTABLE_FIELDS)
  sortBy: UserSortField = 'createdAt';
}
