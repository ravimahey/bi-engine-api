import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '@modules/mail/mail.module';
import { UploadModule } from '@modules/upload/upload.module';
import { UsersModule } from '@modules/users/users.module';
import { AuthController } from './auth.controller';
import { GoogleInitGuard } from './guards';
import {
  AuthPasswordResetService,
  AuthService,
  AuthTokenService,
} from './services';
import { GoogleStrategy, JwtRefreshStrategy, JwtStrategy } from './strategies';

@Module({
  imports: [
    UsersModule,
    MailModule,
    UploadModule,
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    AuthPasswordResetService,
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleStrategy,
    GoogleInitGuard,
  ],
})
export class AuthModule {}
