import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

/**
 * Bounds every findings/KPI aggregate to one organization and one date
 * range — `organizationId` stays a required, caller-supplied param (an
 * admin needs to pick which organization to look at) and the service
 * validates it against the authenticated caller's own organization for
 * any non-admin, same contract as `records`' filter DTOs.
 */
export class ExpenseSummaryQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationId: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  dateFrom: string;

  @ApiProperty({ example: '2026-08-31' })
  @IsDateString()
  dateTo: string;
}
