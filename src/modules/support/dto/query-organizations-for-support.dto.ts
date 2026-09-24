import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';

/**
 * Browse/search for a support user picking an organization to request
 * access to. Two distinct filters per spec (organization name, owner name)
 * rather than the inherited free-text `search`, which this DTO leaves unused.
 */
export class QueryOrganizationsForSupportDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by organization name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  organizationName?: string;

  @ApiPropertyOptional({
    description: "Filter by the organization owner's name",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  ownerName?: string;
}
