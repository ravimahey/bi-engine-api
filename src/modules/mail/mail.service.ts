import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { APP_CONFIG_KEY, type AppConfig } from '@config';
import {
  buildForgotPasswordEmailHtml,
  FORGOT_PASSWORD_EMAIL_SUBJECT,
} from './templates';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const { mail } = this.configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);

    this.transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.port === 465, // true for 465, false for other ports
      auth: mail.user
        ? {
            user: mail.user,
            pass: mail.pass,
          }
        : undefined,
    });
  }

  async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
    const { mail, auth } =
      this.configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);

    // Convenience link back to the app's reset-password page (prefilled with
    // the email) — the OTP above is still the actual credential; this link
    // carries no token of its own.
    const resetUrl = `${auth.frontendUrl}/auth/reset-password?email=${encodeURIComponent(to)}`;

    const html = buildForgotPasswordEmailHtml({
      otp,
      resetUrl,
      otpExpiresInMinutes: auth.otpExpiresInMinutes,
    });

    try {
      const info = await this.transporter.sendMail({
        from: mail.from,
        to,
        subject: FORGOT_PASSWORD_EMAIL_SUBJECT,
        html,
      });

      this.logger.log(`Password reset email sent to ${to}`);

      // If using ethereal email for dev, log the preview URL
      if (mail.host.includes('ethereal')) {
        this.logger.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException(
        'Failed to send password reset email. Please try again later.',
      );
    }
  }
}
