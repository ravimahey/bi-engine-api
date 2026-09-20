import { ApiProperty } from '@nestjs/swagger';
import { ProviderConnectionSummaryDto } from './provider-connection-summary.dto';

export class OrganizationOverviewDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Riverside Bistro' })
  name: string;

  @ApiProperty({ example: 'riverside-bistro' })
  slug: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({
    description: 'Non-deleted users belonging to the organization',
  })
  userCount: number;

  @ApiProperty({ type: ProviderConnectionSummaryDto, isArray: true })
  connections: ProviderConnectionSummaryDto[];

  @ApiProperty({
    description: 'Connections currently in the "error" status',
  })
  errorConnectionCount: number;

  @ApiProperty({
    nullable: true,
    type: Date,
    description:
      'Oldest last-synced time across the organization’s sync cursors, i.e. its most stale entity. Null when nothing has synced yet.',
  })
  lastSyncedAt: Date | null;
}
