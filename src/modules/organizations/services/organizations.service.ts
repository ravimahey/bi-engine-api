import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository, type FindOptionsWhere } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization, paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { AuthTokenService } from '@modules/auth/services';
import { UserRole } from '@modules/users/entities';
import { UsersService } from '@modules/users/services';
import {
  CreateOrganizationDto,
  QueryOrganizationsDto,
  UpdateOrganizationDto,
} from '../dto';
import {
  Organization,
  OrganizationRole,
  OrganizationUser,
  OrganizationUserStatus,
} from '../entities';
import type { CreateOrganizationResult } from '../types';
import { OrganizationProfileService } from './organization-profile.service';
import { OrganizationSlugService } from './organization-slug.service';

/**
 * Organization CRUD — the tenant record every provider connection and
 * canonical record is scoped to. Admins can act on any organization; a
 * owner can only create their own (once) and read/update it —
 * `assertOwnOrganization` enforces that everywhere a non-admin caller is
 * involved.
 */
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(OrganizationUser)
    private readonly organizationUsersRepository: Repository<OrganizationUser>,
    private readonly usersService: UsersService,
    private readonly authTokenService: AuthTokenService,
    private readonly profileService: OrganizationProfileService,
    private readonly slugService: OrganizationSlugService,
  ) {}

  /**
   * Self-serve for an owner: creates the organization and links the
   * calling user to it, then re-issues their session so the new
   * `organizationId` claim is usable immediately without a re-login.
   * An admin can also create a standalone organization on someone else's
   * behalf — that path never touches the admin's own account or session.
   * Without an explicit `slug`, a unique one is generated from `name`.
   */
  async create(
    dto: CreateOrganizationDto,
    currentUser: AuthenticatedUser,
  ): Promise<CreateOrganizationResult> {
    const isSelfServe = currentUser.role !== (UserRole.ADMIN as string);

    if (isSelfServe) {
      // Re-check against the DB rather than trusting the caller's JWT claim:
      // a still-valid token issued before this user had an org would
      // otherwise read organizationId as null even if they created one
      // moments ago in another tab, letting them create a second one.
      const caller = await this.usersService.findOne(currentUser.id);
      if (caller.organizationId) {
        throw new ConflictException('You already belong to an organization');
      }
    }

    this.profileService.assertValid(dto);

    const slug = dto.slug ?? (await this.slugService.generateUnique(dto.name));
    if (dto.slug) {
      const existingSlug = await this.organizationsRepository.findOne({
        where: { slug },
        withDeleted: true,
      });
      if (existingSlug) {
        throw new ConflictException(
          `An organization with slug "${slug}" already exists`,
        );
      }
    }

    const organization = this.organizationsRepository.create({ ...dto, slug });
    const saved = await this.organizationsRepository.save(organization);
    this.logger.log(`Created organization ${saved.id}`);

    // Create the organization membership record for the creator as OWNER
    const membership = this.organizationUsersRepository.create({
      organizationId: saved.id,
      userId: currentUser.id,
      role: OrganizationRole.OWNER,
      status: OrganizationUserStatus.ACTIVE,
    });
    await this.organizationUsersRepository.save(membership);

    if (!isSelfServe) {
      return { organization: saved };
    }

    const linkedUser = await this.usersService.linkOrganization(
      currentUser.id,
      saved.id,
    );
    const session = await this.authTokenService.startSession(linkedUser);

    return { organization: saved, tokens: session.tokens };
  }

  /** Lists all organizations the given user has active membership in. */
  async getUserOrganizations(userId: string) {
    const memberships = await this.organizationUsersRepository.find({
      where: { userId, status: OrganizationUserStatus.ACTIVE },
      relations: { organization: true },
    });

    return memberships.map((m) => ({
      ...m.organization,
      membershipRole: m.role,
      membershipStatus: m.status,
    }));
  }

  /** Checks if a user has an active membership in the target organization. */
  async isUserMember(organizationId: string, userId: string): Promise<boolean> {
    const count = await this.organizationUsersRepository.count({
      where: { organizationId, userId, status: OrganizationUserStatus.ACTIVE },
    });
    return count > 0;
  }

  async findAll(
    query: QueryOrganizationsDto,
  ): Promise<Paginated<Organization>> {
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

    const result = await this.organizationsRepository.findAndCount({
      where,
      order: { [sortBy]: order },
      skip: query.skip,
      take: limit,
    });

    return paginate(result, page, limit);
  }

  async findOne(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Organization> {
    if (currentUser.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(currentUser.organizationId, id);
    }

    const organization = await this.organizationsRepository.findOne({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException(`Organization with id "${id}" was not found`);
    }

    return organization;
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    currentUser: AuthenticatedUser,
  ): Promise<Organization> {
    // findOne already enforces ownership for non-admins before returning.
    const organization = await this.findOne(id, currentUser);

    if (dto.slug && dto.slug !== organization.slug) {
      const taken = await this.organizationsRepository.exists({
        where: { slug: dto.slug },
      });
      if (taken) {
        throw new ConflictException(
          `An organization with slug "${dto.slug}" already exists`,
        );
      }
    }

    Object.assign(organization, dto);
    // Checked on the merged result: a PATCH can change `country` without
    // resending the postcode/region/time zone it has to agree with.
    this.profileService.assertValid(organization);
    return this.organizationsRepository.save(organization);
  }

  /** Soft delete — the row stays for auditing/FK integrity and can be restored. Admin-only. */
  async remove(id: string): Promise<void> {
    const result = await this.organizationsRepository.softDelete({ id });

    if (!result.affected) {
      throw new NotFoundException(`Organization with id "${id}" was not found`);
    }

    this.logger.log(`Soft-deleted organization ${id}`);
  }

  /** Admin-only. */
  async restore(id: string): Promise<Organization> {
    const result = await this.organizationsRepository.restore({ id });

    if (!result.affected) {
      throw new NotFoundException(
        `No deleted organization with id "${id}" was found`,
      );
    }

    return this.organizationsRepository.findOneOrFail({ where: { id } });
  }
}
