import { ApiProperty } from '@nestjs/swagger';
import { User } from '@modules/users/entities';
import { OrganizationDetailOverviewDto } from './organization-detail-overview.dto';

export class AdminUserDetailDto {
  @ApiProperty({ type: User })
  user: User;

  @ApiProperty({
    type: OrganizationDetailOverviewDto,
    nullable: true,
    description:
      'The user’s organization with its connections and sync status. Null when the user has no organization, or it has been deleted.',
  })
  organization: OrganizationDetailOverviewDto | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    nullable: true,
    description:
      'Row count per record type (vendors, expense-transactions, …) for the user’s organization; browse each with GET /admin/users/:id/records/:type. Null when the user has no organization.',
  })
  recordCounts: Record<string, number> | null;
}
