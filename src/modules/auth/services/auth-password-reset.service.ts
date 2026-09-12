import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAppConfig } from '@common/utils';
import { MailService } from '@modules/mail/services';
import {
  PasswordService,
  UserCredentialsService,
  UsersService,
} from '@modules/users/services';
import { ForgotPasswordDto, ResetPasswordDto } from '../dto';
import { generateOtp, hashSecret, minutesToMs, secretsMatch } from '../utils';

/**
 * Forgot/reset-password OTP flow, split out of `AuthService` per the
 * project's one-responsibility-per-service rule.
 */
@Injectable()
export class AuthPasswordResetService {
  private readonly logger = new Logger(AuthPasswordResetService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly userCredentialsService: UserCredentialsService,
    private readonly passwordService: PasswordService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * NOTE: by product decision this tells the caller outright when the email
   * isn't registered, trading away the usual anti-enumeration protection
   * (returning identical responses either way) for a clearer, user-friendly
   * error. Every unregistered-email attempt is logged so it can still be
   * monitored/rate-limited at the infra level if abuse shows up.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmailWithSecret(dto.email);
    if (!user) {
      this.logger.warn(
        `Forgot-password requested for unregistered email: ${dto.email}`,
      );
      throw new NotFoundException(
        'No account was found with this email address.',
      );
    }

    const otp = generateOtp();
    const { auth } = getAppConfig(this.configService);
    const expiresAt = new Date(
      Date.now() + minutesToMs(auth.otpExpiresInMinutes),
    );

    await this.userCredentialsService.setPasswordResetOtp(
      user.id,
      hashSecret(otp),
      expiresAt,
    );

    try {
      await this.mailService.sendPasswordResetOtp(user.email, otp);
      this.logger.log(`Password reset OTP sent to ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to deliver password reset OTP to ${user.email}`,
        (error as Error).stack,
      );
      throw error;
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
    if (!secretsMatch(hashSecret(dto.otp), user.resetPasswordOtp)) {
      throw invalidOtp();
    }

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.userCredentialsService.updatePassword(user.id, newHash);
    await this.userCredentialsService.clearPasswordResetOtp(user.id);
    // Force re-login everywhere, including on whatever session leaked the need for a reset.
    await this.userCredentialsService.removeRefreshToken(user.id);
  }
}
