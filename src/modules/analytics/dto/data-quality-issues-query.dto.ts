import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@common/dto';

/**
 * Paginates the "review these" screen for data-quality issues — the
 * unpaginated `count` sibling (`OrganizationIdQueryDto` +
 * `DataQualityService.countIssues`) powers the dashboard badge; this DTO is
 * only for the follow-up list a human actually clicks through.
 */
export class DataQualityIssuesQueryDto extends PaginationQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;
}
