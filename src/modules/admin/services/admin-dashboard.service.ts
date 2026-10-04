import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '@modules/organizations/entities';
import {
  ConnectionStatus,
  ProviderConnection,
} from '@modules/providers/entities';
import { User, UserRole } from '@modules/users/entities';
import { AdminDashboardOverviewDto, AdminDashboardQueryDto } from '../dto';
import { countByPeriod, resolveDashboardRange } from '../utils';

/**
 * Platform-wide KPIs for the admin dashboard: an admin belongs to no
 * organization, so (unlike `modules/dashboard`, which is one tenant's
 * spend/revenue) everything here spans every organization. Snapshot totals
 * (counts, status breakdowns) are always "right now"; only the two growth
 * trends are bounded by the query's date range.
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(ProviderConnection)
    private readonly connections: Repository<ProviderConnection>,
  ) {}

  async getOverview(
    query: AdminDashboardQueryDto,
  ): Promise<AdminDashboardOverviewDto> {
    const { dateFrom, dateToExclusive } = resolveDashboardRange(query);
    const { granularity } = query;

    const [
      totalOrganizations,
      activeOrganizations,
      usersByRoleRows,
      connectionsByStatusRows,
      organizationsWithErrors,
      organizationGrowth,
      userGrowth,
    ] = await Promise.all([
      this.organizations.count(),
      this.organizations.count({ where: { isActive: true } }),
      this.users
        .createQueryBuilder('user')
        .select('user.role', 'role')
        .addSelect('COUNT(*)', 'count')
        .where('user.role != :admin', { admin: UserRole.ADMIN })
        .groupBy('user.role')
        .getRawMany<{ role: UserRole; count: string }>(),
      this.connections
        .createQueryBuilder('connection')
        .select('connection.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('connection.status')
        .getRawMany<{ status: ConnectionStatus; count: string }>(),
      this.connections
        .createQueryBuilder('connection')
        .select('COUNT(DISTINCT connection.organizationId)', 'count')
        .where('connection.status = :status', {
          status: ConnectionStatus.ERROR,
        })
        .getRawOne<{ count: string }>(),
      countByPeriod(this.organizations, {
        alias: 'organization',
        dateFrom,
        dateToExclusive,
        granularity,
      }),
      countByPeriod(this.users, {
        alias: 'user',
        dateFrom,
        dateToExclusive,
        granularity,
        extraWhere: ['user.role != :admin', { admin: UserRole.ADMIN }],
      }),
    ]);

    const usersByRole = { owner: 0, support: 0 };
    for (const row of usersByRoleRows) {
      if (row.role === UserRole.OWNER) usersByRole.owner = Number(row.count);
      if (row.role === UserRole.SUPPORT)
        usersByRole.support = Number(row.count);
    }

    const connectionsByStatus = {
      pending: 0,
      connected: 0,
      error: 0,
      disconnected: 0,
    };
    for (const row of connectionsByStatusRows) {
      connectionsByStatus[row.status] = Number(row.count);
    }

    return {
      totalOrganizations,
      activeOrganizations,
      totalUsers: usersByRole.owner + usersByRole.support,
      usersByRole,
      connectionsByStatus,
      organizationsWithErrors: Number(organizationsWithErrors?.count ?? 0),
      granularity,
      organizationGrowth,
      userGrowth,
    };
  }
}
