import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  type FindOptionsRelations,
  type FindOptionsWhere,
} from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import {
  assertOwnOrganization,
  buildPaginationMeta,
  paginate,
} from '@common/utils';
import type { Paginated } from '@common/types';
import { Organization } from '@modules/organizations/entities';
import { UsersService } from '@modules/users/services';
import {
  CreateSupportRequestDto,
  QuerySupportRequestsDto,
  ReviewSupportRequestDto,
} from '../dto';
import { SupportRequest, SupportRequestStatus } from '../entities';

/**
 * Lifecycle of a support user's access request: create → approve/reject →
 * (if approved) revoke. "No duplicate pending request" is enforced for real
 * by the partial unique index added in `AddSupportRequests` — the pre-check
 * in `createRequest` exists only to turn a normal (non-racing) attempt into
 * a friendly message instead of a raw constraint violation. A genuine race
 * still hits the index and comes back as a 409 through the existing global
 * exception filter. An organization may have several approved (active)
 * support users at once — see `listActiveMembers` — each revocable
 * independently via `revokeAccess`.
 */
@Injectable()
export class SupportRequestsService {
  private readonly logger = new Logger(SupportRequestsService.name);

  constructor(
    @InjectRepository(SupportRequest)
    private readonly supportRequestsRepository: Repository<SupportRequest>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    private readonly usersService: UsersService,
  ) {}

  async createRequest(
    dto: CreateSupportRequestDto,
    currentUser: AuthenticatedUser,
  ): Promise<SupportRequest> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: dto.organizationId, isActive: true },
    });
    if (!organization) {
      throw new NotFoundException(
        `Organization with id "${dto.organizationId}" was not found`,
      );
    }

    const pendingOfMine = await this.supportRequestsRepository.exists({
      where: {
        requesterId: currentUser.id,
        organizationId: dto.organizationId,
        status: SupportRequestStatus.PENDING,
      },
    });

    if (pendingOfMine) {
      throw new ConflictException(
        'You already have a pending request for this organization',
      );
    }

    const request = this.supportRequestsRepository.create({
      requesterId: currentUser.id,
      organizationId: dto.organizationId,
    });
    const saved = await this.supportRequestsRepository.save(request);
    this.logger.log(
      `Support request ${saved.id} created by user ${currentUser.id} for organization ${dto.organizationId}`,
    );

    return saved;
  }

  async listMyRequests(
    currentUser: AuthenticatedUser,
    query: QuerySupportRequestsDto,
  ): Promise<Paginated<SupportRequest>> {
    return this.listByWhere(
      {
        requesterId: currentUser.id,
        ...(query.status ? { status: query.status } : {}),
      },
      query,
      { organization: true },
    );
  }

  async listIncomingRequests(
    currentUser: AuthenticatedUser,
    query: QuerySupportRequestsDto,
  ): Promise<Paginated<SupportRequest>> {
    // A caller with no organization simply has nothing incoming — an empty
    // page rather than a special "you don't own an org" error.
    if (!currentUser.organizationId) {
      return {
        items: [],
        meta: buildPaginationMeta(0, query.page, query.limit),
      };
    }

    // Always pending, regardless of any `status` the caller passes: this is
    // the owner's action inbox, not a history — once a request is
    // approved/rejected it belongs on the requester's own `GET
    // /support/requests/me`, not here.
    return this.listByWhere(
      {
        organizationId: currentUser.organizationId,
        status: SupportRequestStatus.PENDING,
      },
      query,
      { requester: true },
    );
  }

  /** The owner's current "team": every approved (active) support user for their own organization. */
  async listActiveMembers(
    currentUser: AuthenticatedUser,
    query: QuerySupportRequestsDto,
  ): Promise<Paginated<SupportRequest>> {
    if (!currentUser.organizationId) {
      return {
        items: [],
        meta: buildPaginationMeta(0, query.page, query.limit),
      };
    }

    return this.listByWhere(
      {
        organizationId: currentUser.organizationId,
        status: SupportRequestStatus.APPROVED,
      },
      query,
      { requester: true },
    );
  }

  /**
   * Pulls one active support user's access to the caller's own organization
   * — flips their APPROVED request to REVOKED and unlinks their
   * `organizationId`, the mirror image of the link `reviewRequest` makes on
   * approval.
   */
  async revokeAccess(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<SupportRequest> {
    const request = await this.supportRequestsRepository.findOne({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException(
        `Support request with id "${id}" was not found`,
      );
    }

    assertOwnOrganization(currentUser.organizationId, request.organizationId);

    const result = await this.supportRequestsRepository.update(
      { id, status: SupportRequestStatus.APPROVED },
      {
        status: SupportRequestStatus.REVOKED,
        reviewedById: currentUser.id,
        reviewedAt: new Date(),
      },
    );
    if (!result.affected) {
      throw new ConflictException(
        "This support user's access is not currently active",
      );
    }

    await this.usersService.unlinkOrganization(request.requesterId);
    this.logger.log(
      `Support request ${id} revoked by ${currentUser.id} — user ${request.requesterId} unlinked from organization ${request.organizationId}`,
    );

    return this.supportRequestsRepository.findOneOrFail({ where: { id } });
  }

  async reviewRequest(
    id: string,
    dto: ReviewSupportRequestDto,
    currentUser: AuthenticatedUser,
  ): Promise<SupportRequest> {
    const request = await this.supportRequestsRepository.findOne({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException(
        `Support request with id "${id}" was not found`,
      );
    }

    assertOwnOrganization(currentUser.organizationId, request.organizationId);

    if (dto.status === SupportRequestStatus.APPROVED) {
      // A support user only ever belongs to one organization at a time
      // (single `User.organizationId`) even though an org may have several
      // support users — re-checked fresh from the DB to guard the race of
      // this same requester being approved by two organizations at once;
      // no DB constraint covers that race, so this check is the only guard.
      const requester = await this.usersService.findOne(request.requesterId);
      if (requester.organizationId) {
        throw new ConflictException(
          'This support user is already assigned to an organization',
        );
      }
    }

    const result = await this.supportRequestsRepository.update(
      { id, status: SupportRequestStatus.PENDING },
      {
        status: dto.status,
        reviewedById: currentUser.id,
        reviewedAt: new Date(),
      },
    );
    if (!result.affected) {
      throw new ConflictException('This request has already been reviewed');
    }

    if (dto.status === SupportRequestStatus.APPROVED) {
      await this.usersService.linkOrganization(
        request.requesterId,
        request.organizationId,
      );
      this.logger.log(
        `Support request ${id} approved by ${currentUser.id} — user ${request.requesterId} linked to organization ${request.organizationId}`,
      );
    }

    return this.supportRequestsRepository.findOneOrFail({ where: { id } });
  }

  private async listByWhere(
    where: FindOptionsWhere<SupportRequest>,
    query: QuerySupportRequestsDto,
    relations?: FindOptionsRelations<SupportRequest>,
  ): Promise<Paginated<SupportRequest>> {
    const { page, limit, sortBy, order } = query;

    const result = await this.supportRequestsRepository.findAndCount({
      where,
      relations,
      order: { [sortBy]: order },
      skip: query.skip,
      take: limit,
    });

    return paginate(result, page, limit);
  }
}
