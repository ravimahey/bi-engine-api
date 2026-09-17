import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Query param shared by every single-resource/singleton master-data read
 * (`GET /records/vendors/:id`, `GET /records/customers/:id`,
 * `GET /records/company-profile`) — the resource's own id never carries its
 * organization, so the caller's target organization is always passed
 * explicitly and checked against `assertOwnOrganization` for non-admins.
 */
export class OrganizationIdQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;
}
