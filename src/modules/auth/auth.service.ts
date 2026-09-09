import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import {
  createHash,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { APP_CONFIG_KEY, type AppConfig } from '@config';
import { MailService } from '@modules/mail/mail.service';
import { User } from '@modules/users/entities/user.entity';
import { UsersService } from '@modules/users/users.service';
import {
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
  UpdatePasswordDto,
  UpdateProfileDto,
} from './dto';
import type { GoogleProfile } from './interfaces/jwt-payload.interface';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: User;
  tokens: AuthTokens;
}

/**
 * Every method that ends a request cycle successfully returns the fresh
 * `{ user, tokens }` pair; the controller is the only place that touches
 * cookies — this service never knows about Express Request/Response.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResult> {
    const user = await this.usersService.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
      role: dto.role,
      isActive: true,
    });

    return this.startSession(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmailWithSecret(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses Google Sign-In. Please continue with Google.',
      );
    }
    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account has been deactivated. Contact an administrator.',
      );
    }

    const passwordMatches = await this.usersService.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.startSession(user);
  }

  async loginWithGoogle(profile: GoogleProfile): Promise<AuthResult> {
    let user = await this.usersService.findByGoogleId(profile.googleId);

    if (!user) {
      const existing = await this.usersService.findByEmailWithSecret(
        profile.email,
      );

      if (existing) {
        // Same email already has an account — attach Google as another way in
        // rather than creating a duplicate.
        await this.usersService.linkGoogleAccount(
          existing.id,
          profile.googleId,
        );
        user = existing;
      } else {
        user = await this.usersService.createFromGoogle({
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          googleId: profile.googleId,
          role: profile.requestedRole,
        });
      }
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account has been deactivated. Contact an administrator.',
      );
    }

    return this.startSession(user);
  }

  /**
   * Rotates the refresh token: the presented one must match the single hash
   * on file. A mismatch — an already-used or forged token — clears the
   * stored hash so a stolen token can't be replayed again, and forces the
   * legitimate user to log back in.
   */
  async refreshSession(
    userId: string,
    presentedRefreshToken: string,
  ): Promise<AuthResult> {
    const user = await this.usersService.findByIdWithSecret(userId);
    const sessionExpired = () =>
      new UnauthorizedException('Session expired, please log in again');

    if (!user || !user.hashedRefreshToken) throw sessionExpired();

    const matches = this.hashesMatch(
      this.hashToken(presentedRefreshToken),
      user.hashedRefreshToken,
    );
    if (!matches) {
      await this.usersService.removeRefreshToken(user.id);
      throw sessionExpired();
    }
    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account has been deactivated. Contact an administrator.',
      );
    }

    return this.startSession(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.removeRefreshToken(userId);
  }

  async getProfile(userId: string): Promise<User> {
    return this.usersService.findOne(userId);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    return this.usersService.update(userId, dto);
  }

  async changePassword(userId: string, dto: UpdatePasswordDto): Promise<void> {
    const user = await this.usersService.findByIdWithSecret(userId);
    if (!user)
      throw new UnauthorizedException('Session expired, please log in again');

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account has no password yet — use "Forgot password" to set one.',
      );
    }

    const oldPasswordMatches = await this.usersService.verifyPassword(
      dto.oldPassword,
      user.passwordHash,
    );
    if (!oldPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await this.usersService.hashPassword(dto.newPassword);
    await this.usersService.updatePassword(userId, newHash);
    // A changed password invalidates every other session.
    await this.usersService.removeRefreshToken(userId);
  }

  /**
   * Always resolves the same way whether or not the email exists — and even
   * if delivery fails — so the response can't be used to probe which emails
   * are registered.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmailWithSecret(dto.email);
    if (!user) return;

    const otp = this.generateOtp();
    const { auth } = this.configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
    const expiresAt = new Date(Date.now() + auth.otpExpiresInMinutes * 60_000);

    await this.usersService.setPasswordResetOtp(
      user.id,
      this.hashToken(otp),
      expiresAt,
    );

    try {
      await this.mailService.sendPasswordResetOtp(user.email, otp);
    } catch (error) {
      this.logger.error(
        `Failed to deliver password reset OTP to ${user.email}`,
        (error as Error).stack,
      );
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmailWithSecret(dto.email);
    const invalidOtp = () => new BadRequestException('Invalid or expired OTP');

    if (!user || !user.resetPasswordOtp || !user.resetPasswordOtpExpiresAt) {
      throw invalidOtp();
    }
    if (user.resetPasswordOtpExpiresAt.getTime() < Date.now()) {
      throw invalidOtp();
    }
    if (!this.hashesMatch(this.hashToken(dto.otp), user.resetPasswordOtp)) {
      throw invalidOtp();
    }

    const newHash = await this.usersService.hashPassword(dto.newPassword);
    await this.usersService.updatePassword(user.id, newHash);
    await this.usersService.clearPasswordResetOtp(user.id);
    // Force re-login everywhere, including on whatever session leaked the need for a reset.
    await this.usersService.removeRefreshToken(user.id);
  }

  // ----------------------------------------------------------------- helpers

  private async startSession(user: User): Promise<AuthResult> {
    const tokens = this.issueTokens(user);
    await this.usersService.setRefreshToken(
      user.id,
      this.hashToken(tokens.refreshToken),
    );
    await this.usersService.updateLastLoginAt(user.id);
    return { user, tokens };
  }

  private issueTokens(user: Pick<User, 'id' | 'email' | 'role'>): AuthTokens {
    const { auth } = this.configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
    const claims = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(
      { ...claims, jti: randomUUID() },
      {
        secret: auth.accessSecret,
        // JWT_*_EXPIRES_IN is a validated env string ('15m', '7d', ...); the
        // narrower `StringValue` template type can't be inferred from `string`.
        expiresIn: auth.accessExpiresIn as JwtSignOptions['expiresIn'],
      },
    );
    // A fresh jti on every issuance guarantees the refresh token is unique
    // even when re-issued within the same iat second — see JwtPayload.jti.
    const refreshToken = this.jwtService.sign(
      { ...claims, jti: randomUUID() },
      {
        secret: auth.refreshSecret,
        expiresIn: auth.refreshExpiresIn as JwtSignOptions['expiresIn'],
      },
    );

    return { accessToken, refreshToken };
  }

  /**
   * Refresh tokens and OTPs are high-entropy/rate-limited secrets, so a fast
   * SHA-256 digest (rather than scrypt/bcrypt) is enough — the point is
   * never storing them raw, not slowing down an offline brute force.
   */
  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private hashesMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
