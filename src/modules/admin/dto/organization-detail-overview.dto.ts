import { ApiProperty } from '@nestjs/swagger';
import { OrganizationOverviewDto } from './organization-overview.dto';
import { SyncCursorSummaryDto } from './sync-cursor-summary.dto';

export class OrganizationDetailOverviewDto extends OrganizationOverviewDto {
  @ApiProperty({ type: SyncCursorSummaryDto, isArray: true })
  syncCursors: SyncCursorSummaryDto[];
}
