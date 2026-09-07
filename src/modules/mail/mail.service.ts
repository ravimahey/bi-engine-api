import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { APP_CONFIG_KEY, type AppConfig } from '@config';

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
    const { mail } = this.configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password for Ordara Analytics.</p>
        <p>Your OTP is: <strong style="font-size: 24px;">${otp}</strong></p>
        <p>This OTP is valid for 15 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: mail.from,
        to,
        subject: 'Ordara Analytics - Password Reset OTP',
        html,
      });

      this.logger.log(`Password reset email sent to ${to}`);
      
      // If using ethereal email for dev, log the preview URL
      if (mail.host.includes('ethereal')) {
        this.logger.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, (error as Error).stack);
      throw new Error('Failed to send email');
    }
  }
}
