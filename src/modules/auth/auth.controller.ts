import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, Public, ResponseMessage } from '@common/decorators';
import { GoogleOauthGuard, JwtRefreshGuard } from '@common/guards';
import { clearAuthCookies, setAuthCookies } from '@common/utils/cookie.util';
import { APP_CONFIG_KEY, type AppConfig } from '@config';
import { User } from '@modules/users/entities/user.entity';
import { AuthResult, AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  SELF_SERVICE_ROLES,
  SignupDto,
  UpdatePasswordDto,
  UpdateProfileDto,
} from './dto';
import { GoogleInitGuard } from './guards/google-init.guard';
import type {
  AuthPrincipal,
  GoogleProfile,
  RefreshPrincipal,
} from './interfaces/jwt-payload.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('signup')
  @ResponseMessage('Account created successfully')
  @ApiOperation({
    summary: 'Create a buyer or supplier account (email + password)',
  })
  @ApiOkResponse({ type: User })
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const result = await this.authService.signup(dto);
    return this.attachSession(res, result);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logged in successfully')
  @ApiOperation({ summary: 'Log in with email + password' })
  @ApiOkResponse({ type: User })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const result = await this.authService.login(dto);
    return this.attachSession(res, result);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Session refreshed')
  @ApiOperation({
    summary: 'Rotate the access/refresh token pair using the refresh cookie',
  })
  @ApiOkResponse({ type: User })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired or reused refresh token',
  })
  async refresh(
    @CurrentUser() principal: RefreshPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const result = await this.authService.refreshSession(
      principal.id,
      principal.refreshToken,
    );
    return this.attachSession(res, result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ResponseMessage('Logged out successfully')
  @ApiOperation({
    summary:
      'End the session: revokes the refresh token and clears both cookies',
  })
  async logout(
    @CurrentUser() principal: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    await this.authService.logout(principal.id);
    clearAuthCookies(res, this.appConfig());
    return null;
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ResponseMessage('Profile fetched successfully')
  @ApiOperation({ summary: 'Get the signed-in user’s profile' })
  @ApiOkResponse({ type: User })
  getProfile(@CurrentUser() principal: AuthPrincipal): Promise<User> {
    return this.authService.getProfile(principal.id);
  }

  @Patch('profile')
  @ApiBearerAuth('access-token')
  @ResponseMessage('Profile updated successfully')
  @ApiOperation({ summary: 'Update the signed-in user’s own name/email' })
  @ApiOkResponse({ type: User })
  updateProfile(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdateProfileDto,
  ): Promise<User> {
    return this.authService.updateProfile(principal.id, dto);
  }

  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ResponseMessage('Password changed successfully')
  @ApiOperation({
    summary: 'Change password while signed in (requires the current password)',
  })
  async changePassword(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdatePasswordDto,
  ): Promise<null> {
    await this.authService.changePassword(principal.id, dto);
    return null;
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('If that email is registered, an OTP has been sent')
  @ApiOperation({
    summary: 'Email a one-time password to reset the account password',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<null> {
    await this.authService.forgotPassword(dto);
    return null;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Password reset successfully')
  @ApiOperation({ summary: 'Set a new password using the emailed OTP' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<null> {
    await this.authService.resetPassword(dto);
    return null;
  }

  @Public()
  @UseGuards(GoogleInitGuard)
  @Get('google')
  @ApiOperation({
    summary: 'Start Google sign-in/sign-up (redirects to Google)',
  })
  @ApiQuery({
    name: 'role',
    enum: SELF_SERVICE_ROLES,
    required: false,
    description:
      'Role for a brand-new account; ignored if the Google account already exists. Defaults to buyer.',
  })
  googleAuth(): void {
    // GoogleInitGuard redirects to Google before this body ever runs.
  }

  @Public()
  @UseGuards(GoogleOauthGuard)
  @Get('google/callback')
  @ApiOperation({
    summary:
      'Google OAuth callback — sets session cookies and redirects to the frontend',
  })
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const profile = req.user as GoogleProfile;
    const config = this.appConfig();

    try {
      const result = await this.authService.loginWithGoogle(profile);
      setAuthCookies(res, config, result.tokens);
      res.redirect(`${config.auth.frontendUrl}/auth/callback`);
    } catch {
      res.redirect(
        `${config.auth.frontendUrl}/auth/login?error=google_auth_failed`,
      );
    }
  }

  // ----------------------------------------------------------------- helpers

  private appConfig(): AppConfig {
    return this.configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
  }

  private attachSession(res: Response, result: AuthResult): User {
    setAuthCookies(res, this.appConfig(), result.tokens);
    return result.user;
  }
}
