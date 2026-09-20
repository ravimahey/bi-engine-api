import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type ObjectLiteral } from 'typeorm';
import { PaginationQueryDto } from '@common/dto';
import type { Paginated } from '@common/types';
import { paginate } from '@common/utils';
import { ADMIN_RECORD_ENTITIES, ADMIN_RECORD_TYPES } from '../constants';
import type { AdminRecordType } from '../constants';
import { AdminUserDetailDto } from '../dto';
import { AdminOrganizationOverviewService } from './admin-organization-overview.service';
import { AdminUsersService } from './admin-users.service';

/**
 * Everything an admin can see about a user: the account itself plus all the
 * data of the organization the user belongs to (records are stored per
 * organization, so that is the user's data). Read-only.
 */
@Injectable()
export class AdminUserDataService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly adminUsers: AdminUsersService,
    private readonly organizationOverview: AdminOrganizationOverviewService,
  ) {}

  async getDetail(userId: string): Promise<AdminUserDetailDto> {
    const user = await this.adminUsers.findOne(userId);

    if (!user.organizationId) {
      return { user, organization: null, recordCounts: null };
    }

    const organizationId = user.organizationId;
    const [organization, recordCounts] = await Promise.all([
      this.organizationOverview.findOne(organizationId).catch((error) => {
        // A soft-deleted organization's data is still there to inspect.
        if (error instanceof NotFoundException) {
          return null;
        }
        throw error;
      }),
      this.countRecords(organizationId),
    ]);

    return { user, organization, recordCounts };
  }

  async listRecords(
    userId: string,
    type: AdminRecordType,
    query: PaginationQueryDto,
  ): Promise<Paginated<ObjectLiteral>> {
    const user = await this.adminUsers.findOne(userId);

    if (!user.organizationId) {
      throw new NotFoundException(
        `User with id "${userId}" does not belong to an organization`,
      );
    }

    const result = await this.dataSource
      .getRepository<ObjectLiteral>(ADMIN_RECORD_ENTITIES[type])
      .findAndCount({
        where: { organizationId: user.organizationId },
        order: { createdAt: query.order },
        skip: query.skip,
        take: query.limit,
      });

    return paginate(result, query.page, query.limit);
  }

  private async countRecords(
    organizationId: string,
  ): Promise<Record<string, number>> {
    const counts = await Promise.all(
      ADMIN_RECORD_TYPES.map((type) =>
        this.dataSource
          .getRepository<ObjectLiteral>(ADMIN_RECORD_ENTITIES[type])
          .count({ where: { organizationId } }),
      ),
    );

    return Object.fromEntries(
      ADMIN_RECORD_TYPES.map((type, index) => [type, counts[index]]),
    );
  }
}
