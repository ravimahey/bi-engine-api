import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Query param for `GET /quickbooks/sync-status` — which organization's connection to report freshness for. */
export class QuickbooksSyncStatusQueryDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Organization whose QuickBooks sync status to check',
  })
  @IsUUID('4')
  organizationId: string;
}
