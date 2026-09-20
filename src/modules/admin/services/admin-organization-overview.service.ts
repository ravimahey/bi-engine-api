import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository, type FindOptionsWhere } from 'typeorm';
import { paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { QueryOrganizationsDto } from '@modules/organizations/dto';
import { Organization } from '@modules/organizations/entities';
import {
  ConnectionStatus,
  ProviderConnection,
  SyncCursor,
} from '@modules/providers/entities';
import { User } from '@modules/users/entities';
import { OrganizationDetailOverviewDto, OrganizationOverviewDto } from '../dto';

/**
 * Cross-tenant "how is each customer doing" view: user count, connection
 * health and data freshness per organization. A page of organizations costs
 * a fixed handful of queries (one grouped query per metric, keyed by the
 * page's organization ids), never one query per organization.
 */
@Injectable()
export class AdminOrganizationOverviewService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(ProviderConnection)
    private readonly connectionsRepository: Repository<ProviderConnection>,
    @InjectRepository(SyncCursor)
    private readonly cursorsRepository: Repository<SyncCursor>,
  ) {}

  async findAll(
    query: QueryOrganizationsDto,
  ): Promise<Paginated<OrganizationOverviewDto>> {
    const { page, limit, search, isActive, sortBy, order } = query;

    const baseWhere: FindOptionsWhere<Organization> = {
      ...(isActive === undefined ? {} : { isActive }),
    };

    // An array of conditions is OR'ed by TypeORM — one branch per searchable column.
    const where:
      FindOptionsWhere<Organization> | FindOptionsWhere<Organization>[] = search
      ? [
          { ...baseWhere, name: ILike(`%${search}%`) },
          { ...baseWhere, slug: ILike(`%${search}%`) },
        ]
      : baseWhere;

    const [organizations, total] =
      await this.organizationsRepository.findAndCount({
        where,
        order: { [sortBy]: order },
        skip: query.skip,
        take: limit,
      });

    const items = await this.summarize(organizations);

    return paginate([items, total], page, limit);
  }

  async findOne(id: string): Promise<OrganizationDetailOverviewDto> {
    const organization = await this.organizationsRepository.findOne({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException(`Organization with id "${id}" was not found`);
    }

    const [summary] = await this.summarize([organization]);

    const cursors = await this.cursorsRepository.find({
      where: { providerConnection: { organizationId: id } },
      order: { entityType: 'ASC' },
    });

    return {
      ...summary,
      syncCursors: cursors.map(
        ({ providerConnectionId, entityType, cursor, lastSyncedAt }) => ({
          providerConnectionId,
          entityType,
          cursor,
          lastSyncedAt,
        }),
      ),
    };
  }

  private async summarize(
    organizations: Organization[],
  ): Promise<OrganizationOverviewDto[]> {
    if (organizations.length === 0) {
      return [];
    }

    const ids = organizations.map(({ id }) => id);

    const [userCounts, connections, staleness] = await Promise.all([
      this.usersRepository
        .createQueryBuilder('user')
        .select('user.organizationId', 'organizationId')
        .addSelect('COUNT(*)', 'count')
        .where('user.organizationId IN (:...ids)', { ids })
        .groupBy('user.organizationId')
        .getRawMany<{ organizationId: string; count: string }>(),
      this.connectionsRepository.find({
        where: { organizationId: In(ids) },
        select: {
          id: true,
          organizationId: true,
          provider: true,
          status: true,
          lastError: true,
          connectedAt: true,
        },
        order: { provider: 'ASC' },
      }),
      this.cursorsRepository
        .createQueryBuilder('cursor')
        .innerJoin('cursor.providerConnection', 'connection')
        .select('connection.organizationId', 'organizationId')
        .addSelect('MIN(cursor.lastSyncedAt)', 'oldestSyncedAt')
        .where('connection.organizationId IN (:...ids)', { ids })
        .groupBy('connection.organizationId')
        .getRawMany<{ organizationId: string; oldestSyncedAt: Date | null }>(),
    ]);

    const userCountByOrg = new Map(
      userCounts.map((row) => [row.organizationId, Number(row.count)]),
    );
    const oldestSyncByOrg = new Map(
      staleness.map((row) => [row.organizationId, row.oldestSyncedAt]),
    );
    const connectionsByOrg = new Map<string, ProviderConnection[]>();
    for (const connection of connections) {
      const list = connectionsByOrg.get(connection.organizationId) ?? [];
      list.push(connection);
      connectionsByOrg.set(connection.organizationId, list);
    }

    return organizations.map((organization) => {
      const orgConnections = connectionsByOrg.get(organization.id) ?? [];

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        isActive: organization.isActive,
        createdAt: organization.createdAt,
        userCount: userCountByOrg.get(organization.id) ?? 0,
        connections: orgConnections.map(
          ({ id, provider, status, lastError, connectedAt }) => ({
            id,
            provider,
            status,
            lastError,
            connectedAt,
          }),
        ),
        errorConnectionCount: orgConnections.filter(
          ({ status }) => status === ConnectionStatus.ERROR,
        ).length,
        lastSyncedAt: oldestSyncByOrg.get(organization.id) ?? null,
      };
    });
  }
}
