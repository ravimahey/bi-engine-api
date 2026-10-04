import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UploadService } from '@modules/upload/services';
import { User, UserRole } from '@modules/users/entities';
import {
  PasswordService,
  UserCredentialsService,
  UsersService,
} from '@modules/users/services';
import { AuthPasswordResetService } from './auth-password-reset.service';
import { AuthTokenService } from './auth-token.service';
import { GoogleTokenVerifierService } from './google-token-verifier.service';
import {
  AUTH_ERROR_MESSAGES,
  avatarPublicId,
  AVATAR_FOLDER,
} from '../constants';
import {
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
  UpdatePasswordDto,
  UpdateProfileDto,
} from '../dto';
import type { AuthResult, GoogleProfile } from '../types';

/**
 * Signup/login/profile only — session/token lifecycle lives in
 * `AuthTokenService`, the forgot/reset-password OTP flow in
 * `AuthPasswordResetService`. The controller is the only place that touches
 * cookies; this service (and the two it delegates to) never knows about
 * Express Request/Response.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userCredentialsService: UserCredentialsService,
    private readonly passwordService: PasswordService,
    private readonly uploadService: UploadService,
    private readonly authTokenService: AuthTokenService,
    private readonly authPasswordResetService: AuthPasswordResetService,
    private readonly googleTokenVerifier: GoogleTokenVerifierService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResult> {
    const user = await this.usersService.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
      role: dto.role ?? UserRole.OWNER,
      isActive: true,
    });

    return this.authTokenService.startSession(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmailWithSecret(dto.email);
    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses Google Sign-In. Please continue with Google.',
      );
    }
    if (!user.isActive) {
      throw new ForbiddenException(AUTH_ERROR_MESSAGES.ACCOUNT_DEACTIVATED);
    }

    const passwordMatches = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    return this.authTokenService.startSession(user);
  }

  async loginWithGoogle(profile: GoogleProfile): Promise<AuthResult> {
    let user = await this.userCredentialsService.findByGoogleId(
      profile.googleId,
    );

    if (!user) {
      const existing = await this.usersService.findByEmailWithSecret(
        profile.email,
      );

      if (existing) {
        // Same email already has an account — attach Google as another way in
        // rather than creating a duplicate.
        await this.userCredentialsService.linkGoogleAccount(
          existing.id,
          profile.googleId,
        );
        user = existing;
      } else {
        user = await this.userCredentialsService.createFromGoogle({
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          googleId: profile.googleId,
          role: profile.requestedRole,
        });
      }
    }

    if (!user.isActive) {
      throw new ForbiddenException(AUTH_ERROR_MESSAGES.ACCOUNT_DEACTIVATED);
    }

    return this.authTokenService.startSession(user);
  }

  /** ID-token flow: verify Google's token, then reuse the redirect flow's find/link/create logic. */
  async loginWithGoogleIdToken(dto: GoogleLoginDto): Promise<AuthResult> {
    const identity = await this.googleTokenVerifier.verify(dto.idToken);

    return this.loginWithGoogle({
      ...identity,
      requestedRole: dto.role ?? UserRole.OWNER,
    });
  }

  async refreshSession(
    userId: string,
    presentedRefreshToken: string,
  ): Promise<AuthResult> {
    return this.authTokenService.refreshSession(userId, presentedRefreshToken);
  }

  async logout(userId: string): Promise<void> {
    return this.authTokenService.logout(userId);
  }

  async getProfile(userId: string): Promise<User> {
    return this.usersService.findOne(userId);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    avatar?: Express.Multer.File,
  ): Promise<User> {
    const user = await this.usersService.update(userId, dto);
    if (!avatar) return user;

    // Fixed public id per user: every re-upload overwrites the same Cloudinary
    // asset in place, so there is never a stale image left behind to clean up.
    const uploaded = await this.uploadService.uploadFile(avatar, {
      folder: AVATAR_FOLDER,
      publicId: avatarPublicId(userId),
    });

    await this.userCredentialsService.updateAvatar(
      userId,
      uploaded.secureUrl,
      uploaded.publicId,
    );
    user.avatarUrl = uploaded.secureUrl;

    return user;
  }

  async changePassword(userId: string, dto: UpdatePasswordDto): Promise<void> {
    const user = await this.usersService.findByIdWithSecret(userId);
    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.SESSION_EXPIRED);
    }

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account has no password yet — use "Forgot password" to set one.',
      );
    }

    const oldPasswordMatches = await this.passwordService.verify(
      dto.oldPassword,
      user.passwordHash,
    );
    if (!oldPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.userCredentialsService.updatePassword(userId, newHash);
    // A changed password invalidates every other session.
    await this.userCredentialsService.removeRefreshToken(userId);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    return this.authPasswordResetService.forgotPassword(dto);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    return this.authPasswordResetService.resetPassword(dto);
  }
}
