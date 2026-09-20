import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

/**
 * Base of every dashboard graph query — one organization and one date range.
 * `organizationId` stays caller-supplied (an admin picks which organization
 * to view); the service validates it against a non-admin's own organization.
 */
export class DashboardQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  dateFrom: string;

  @ApiProperty({ example: '2026-08-31' })
  @IsDateString()
  dateTo: string;
}
