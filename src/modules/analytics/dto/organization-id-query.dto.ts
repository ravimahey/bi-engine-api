import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Bounds an unbounded-date-range aggregate (e.g. duplicate detection) to one
 * organization — required, caller-supplied (an admin needs to pick which
 * organization to scan), validated against the authenticated caller's own
 * organization for any non-admin, same contract as `records`' query DTOs.
 */
export class OrganizationIdQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;
}
