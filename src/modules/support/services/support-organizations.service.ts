import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginationMeta } from '@common/utils';
import type { Paginated } from '@common/types';
import { Organization } from '@modules/organizations/entities';
import { UserRole } from '@modules/users/entities';
import { QueryOrganizationsForSupportDto } from '../dto';
import type { OrganizationForSupport } from '../types';

interface OrganizationForSupportRow {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  ownerFirstName: string | null;
  ownerLastName: string | null;
}

/**
 * Browse/search organizations for a support user picking one to request
 * access to. Injects `Organization` directly (same cross-module pattern
 * `AdminModule` uses) rather than going through `OrganizationsService`,
 * since this is a different read shape (org + inferred owner name) with
 * different visibility rules (any active org, not "your own").
 */
@Injectable()
export class SupportOrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  async listOrganizations(
    query: QueryOrganizationsForSupportDto,
  ): Promise<Paginated<OrganizationForSupport>> {
    const { page, limit, organizationName, ownerName } = query;

    // "Owner" is the one `UserRole.OWNER` user currently linked to this org
    // (there's no membership table, only `User.organizationId`, and only
    // self-serve org creation sets it for an owner, so at most one owner is
    // ever linked per org).
    const qb = this.organizationsRepository
      .createQueryBuilder('org')
      .leftJoin('org.users', 'owner', 'owner.role = :ownerRole', {
        ownerRole: UserRole.OWNER,
      })
      .where('org.isActive = :isActive', { isActive: true });

    if (organizationName) {
      qb.andWhere('org.name ILIKE :organizationName', {
        organizationName: `%${organizationName}%`,
      });
    }
    if (ownerName) {
      qb.andWhere(
        '(owner.first_name ILIKE :ownerName OR owner.last_name ILIKE :ownerName)',
        { ownerName: `%${ownerName}%` },
      );
    }

    const total = await qb.getCount();

    const rows = await qb
      .select('org.id', 'id')
      .addSelect('org.name', 'name')
      .addSelect('org.slug', 'slug')
      .addSelect('org.createdAt', 'createdAt')
      .addSelect('owner.firstName', 'ownerFirstName')
      .addSelect('owner.lastName', 'ownerLastName')
      .orderBy('org.createdAt', 'DESC')
      .offset(query.skip)
      .limit(limit)
      .getRawMany<OrganizationForSupportRow>();

    const items: OrganizationForSupport[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.createdAt,
      ownerName:
        (row.ownerFirstName ?? row.ownerLastName)
          ? `${row.ownerFirstName ?? ''} ${row.ownerLastName ?? ''}`.trim()
          : null,
    }));

    return { items, meta: buildPaginationMeta(total, page, limit) };
  }
}
