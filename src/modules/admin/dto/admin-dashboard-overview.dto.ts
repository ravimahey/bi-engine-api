import { ApiProperty } from '@nestjs/swagger';
import { TIME_GRANULARITIES } from '@common/constants';
import type { TimeGranularity } from '@common/constants';

export class UsersByRoleDto {
  @ApiProperty({ example: 42 })
  supplier: number;

  @ApiProperty({ example: 58 })
  buyer: number;
}

export class ConnectionsByStatusDto {
  @ApiProperty({ example: 3 })
  pending: number;

  @ApiProperty({ example: 71 })
  connected: number;

  @ApiProperty({ example: 4 })
  error: number;

  @ApiProperty({ example: 6 })
  disconnected: number;
}

export class GrowthPointDto {
  @ApiProperty({
    example: '2026-07-01',
    description: 'Start date of the bucket',
  })
  period: string;

  @ApiProperty({ example: 6 })
  count: number;
}

export class AdminDashboardOverviewDto {
  @ApiProperty({ example: 84 })
  totalOrganizations: number;

  @ApiProperty({ example: 79 })
  activeOrganizations: number;

  @ApiProperty({
    example: 100,
    description: 'Non-admin users (buyers + suppliers)',
  })
  totalUsers: number;

  @ApiProperty({ type: UsersByRoleDto })
  usersByRole: UsersByRoleDto;

  @ApiProperty({ type: ConnectionsByStatusDto })
  connectionsByStatus: ConnectionsByStatusDto;

  @ApiProperty({
    example: 4,
    description:
      'Organizations with at least one provider connection currently in the "error" status',
  })
  organizationsWithErrors: number;

  @ApiProperty({ enum: TIME_GRANULARITIES })
  granularity: TimeGranularity;

  @ApiProperty({
    type: [GrowthPointDto],
    description: 'New organizations created per bucket, over the query range',
  })
  organizationGrowth: GrowthPointDto[];

  @ApiProperty({
    type: [GrowthPointDto],
    description: 'New non-admin users created per bucket, over the query range',
  })
  userGrowth: GrowthPointDto[];
}
