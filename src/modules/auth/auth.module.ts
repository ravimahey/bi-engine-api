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
  GoogleTokenVerifierService,
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
    GoogleTokenVerifierService,
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleStrategy,
    GoogleInitGuard,
  ],
  // AuthTokenService is exported so OrganizationsService can re-issue a
  // session immediately after linking a self-serve caller to the
  // organization they just created — see OrganizationsModule.
  exports: [AuthTokenService],
})
export class AuthModule {}
