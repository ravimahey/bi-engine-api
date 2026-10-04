import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities';
import type { CreateUserFromGoogleInput } from '../types';
import { isUniqueViolation } from '../utils';

/**
 * Auth-flow-only mutations on `User` — refresh-token/OTP bookkeeping and
 * Google-identity linking — split out of `UsersService` so that class stays
 * pure CRUD. Every method here exists to serve `AuthService`, not the
 * admin-facing user-management endpoints.
 */
@Injectable()
export class UserCredentialsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

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

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.usersRepository.update(id, { passwordHash });
  }

  async updateLastLoginAt(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { googleId } });
  }

  async createFromGoogle(profile: CreateUserFromGoogleInput): Promise<User> {
    const user = this.usersRepository.create({
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      googleId: profile.googleId,
      role: profile.role,
      isActive: true,
      passwordHash: null,
    });
    // Two first-time Google sign-ins for one email can race past the
    // caller's lookup; the unique index stops the second one.
    return this.usersRepository.save(user).catch((error: unknown) => {
      throw isUniqueViolation(error)
        ? new ConflictException(
            `A user with email "${profile.email}" already exists`,
          )
        : error;
    });
  }

  /** Links a Google identity to an existing email/password account (first Google login). */
  async linkGoogleAccount(id: string, googleId: string): Promise<void> {
    await this.usersRepository.update(id, { googleId });
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
