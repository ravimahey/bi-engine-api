import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository, type FindOptionsWhere } from 'typeorm';
import { paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { CreateUserDto, QueryUsersDto, UpdateUserDto } from '../dto';
import { User } from '../entities';
import { SECRET_FIELDS } from '../constants';
import { isUniqueViolation } from '../utils';
import { PasswordService } from './password.service';

/**
 * Reference service: user CRUD lives here, controllers stay thin, and every
 * "not found"/"already exists" case is raised as an HttpException that
 * AllExceptionsFilter renders in the standard error envelope. Password
 * hashing lives in `PasswordService`, auth-flow-only mutations (refresh
 * token, OTP, Google linking) in `UserCredentialsService`.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly passwordService: PasswordService,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
      withDeleted: true,
    });

    if (existing) {
      throw new ConflictException(
        `A user with email "${dto.email}" already exists`,
      );
    }

    const { password, ...rest } = dto;
    const user = this.usersRepository.create({
      ...rest,
      passwordHash: await this.passwordService.hash(password),
    });

    // The pre-check above can't stop two concurrent signups for one email;
    // the unique index does, and this turns that into the same 409.
    const saved = await this.usersRepository
      .save(user)
      .catch((error: unknown) => {
        throw isUniqueViolation(error)
          ? new ConflictException(
              `A user with email "${dto.email}" already exists`,
            )
          : error;
      });
    this.logger.log(`Created user ${saved.id}`);

    return saved;
  }

  async findAll(query: QueryUsersDto): Promise<Paginated<User>> {
    const { page, limit, search, role, isActive, sortBy, order } = query;

    const baseWhere: FindOptionsWhere<User> = {
      ...(role ? { role } : {}),
      ...(isActive === undefined ? {} : { isActive }),
    };

    // An array of conditions is OR'ed by TypeORM — one branch per searchable column.
    const where: FindOptionsWhere<User> | FindOptionsWhere<User>[] = search
      ? [
          { ...baseWhere, email: ILike(`%${search}%`) },
          { ...baseWhere, firstName: ILike(`%${search}%`) },
          { ...baseWhere, lastName: ILike(`%${search}%`) },
        ]
      : baseWhere;

    const result = await this.usersRepository.findAndCount({
      where,
      order: { [sortBy]: order },
      skip: query.skip,
      take: limit,
    });

    return paginate(result, page, limit);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id "${id}" was not found`);
    }

    return user;
  }

  /** Includes the password hash + refresh/OTP secrets — for auth flows only. */
  async findByEmailWithSecret(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
      select: SECRET_FIELDS,
    });
  }

  /** Same secret-bearing projection as {@link findByEmailWithSecret}, keyed by id. */
  async findByIdWithSecret(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      select: SECRET_FIELDS,
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Email is immutable. Under ES2022+ class-field semantics the DTO's
    // declared `email` is an own property (as `undefined`) even when the
    // client never sent it, so drop it rather than let it blank `user.email`.
    const changes: Partial<UpdateUserDto> = { ...dto };
    delete changes.email;
    Object.assign(user, changes);
    return this.usersRepository.save(user);
  }

  /** Soft delete — the row stays for auditing and can be restored. */
  async remove(id: string): Promise<void> {
    const result = await this.usersRepository.softDelete({ id });

    if (!result.affected) {
      throw new NotFoundException(`User with id "${id}" was not found`);
    }

    this.logger.log(`Soft-deleted user ${id}`);
  }

  /**
   * One-time link from a user to the organization they just created/joined
   * — not exposed through `UpdateUserDto`, only ever called from
   * `OrganizationsService.create` right after the org row itself is saved.
   */
  async linkOrganization(
    userId: string,
    organizationId: string,
  ): Promise<User> {
    const user = await this.findOne(userId);
    user.organizationId = organizationId;
    return this.usersRepository.save(user);
  }

  /**
   * Reverses {@link linkOrganization} — called when a support user's access
   * to their organization is revoked (see `SupportRequestsService.revokeAccess`).
   */
  async unlinkOrganization(userId: string): Promise<User> {
    const user = await this.findOne(userId);
    user.organizationId = null;
    return this.usersRepository.save(user);
  }

  async restore(id: string): Promise<User> {
    const result = await this.usersRepository.restore({ id });

    if (!result.affected) {
      throw new NotFoundException(`No deleted user with id "${id}" was found`);
    }

    return this.findOne(id);
  }
}
