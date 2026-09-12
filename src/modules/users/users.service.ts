import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import {
  ILike,
  Repository,
  type FindOptionsSelect,
  type FindOptionsWhere,
} from 'typeorm';
import { paginate } from '@common/utils/pagination.util';
import type { Paginated } from '@common/interfaces/api-response.interface';
import { CreateUserDto, QueryUsersDto, UpdateUserDto } from './dto';
import { User, UserRole } from './entities/user.entity';

/** Promise wrapper around scrypt — promisify() loses the types on its overloads. */
const scrypt = (
  password: string,
  salt: Buffer,
  keylen: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, (error, derivedKey) =>
      error ? reject(error) : resolve(derivedKey),
    );
  });

/** Fields hidden by `select: false` that auth flows need to see explicitly. */
const SECRET_FIELDS: FindOptionsSelect<User> = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  googleId: true,
  passwordHash: true,
  hashedRefreshToken: true,
  resetPasswordOtp: true,
  resetPasswordOtpExpiresAt: true,
};

/**
 * Reference service: all persistence lives here, controllers stay thin, and
 * every "not found"/"already exists" case is raised as an HttpException that
 * AllExceptionsFilter renders in the standard error envelope.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
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
      passwordHash: await this.hashPassword(password),
    });

    const saved = await this.usersRepository.save(user);
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

    if (dto.email && dto.email !== user.email) {
      const taken = await this.usersRepository.exists({
        where: { email: dto.email },
      });
      if (taken) {
        throw new ConflictException(
          `A user with email "${dto.email}" already exists`,
        );
      }
    }

    Object.assign(user, dto);
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

  async restore(id: string): Promise<User> {
    const result = await this.usersRepository.restore({ id });

    if (!result.affected) {
      throw new NotFoundException(`No deleted user with id "${id}" was found`);
    }

    return this.findOne(id);
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [saltHex, keyHex] = storedHash.split(':');
    if (!saltHex || !keyHex) return false;

    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
    const stored = Buffer.from(keyHex, 'hex');

    return derived.length === stored.length && timingSafeEqual(derived, stored);
  }

  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64);

    return `${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  async setRefreshToken(id: string, hashedToken: string): Promise<void> {
    await this.usersRepository.update(id, { hashedRefreshToken: hashedToken });
  }

  async removeRefreshToken(id: string): Promise<void> {
    await this.usersRepository.update(id, { hashedRefreshToken: null });
  }

  async setPasswordResetOtp(
    id: string,
    hashedOtp: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.usersRepository.update(id, {
      resetPasswordOtp: hashedOtp,
      resetPasswordOtpExpiresAt: expiresAt,
    });
  }

  async clearPasswordResetOtp(id: string): Promise<void> {
    await this.usersRepository.update(id, {
      resetPasswordOtp: null,
      resetPasswordOtpExpiresAt: null,
    });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { googleId } });
  }

  async createFromGoogle(profile: {
    email: string;
    firstName: string;
    lastName: string;
    googleId: string;
    role: UserRole;
  }): Promise<User> {
    const user = this.usersRepository.create({
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      googleId: profile.googleId,
      role: profile.role,
      isActive: true,
      passwordHash: null,
    });
    return this.usersRepository.save(user);
  }

  /** Links a Google identity to an existing email/password account (first Google login). */
  async linkGoogleAccount(id: string, googleId: string): Promise<void> {
    await this.usersRepository.update(id, { googleId });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.usersRepository.update(id, { passwordHash });
  }

  async updateLastLoginAt(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  /** Persists the Cloudinary result of a profile picture upload. */
  async updateAvatar(
    id: string,
    avatarUrl: string,
    avatarPublicId: string,
  ): Promise<void> {
    await this.usersRepository.update(id, { avatarUrl, avatarPublicId });
  }
}
