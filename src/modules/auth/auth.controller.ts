import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, Public, ResponseMessage } from '@common/decorators';
import { GoogleOauthGuard, JwtRefreshGuard } from '@common/guards';
import { clearAuthCookies, getAppConfig, setAuthCookies } from '@common/utils';
import { User } from '@modules/users/entities';
import { AuthService } from './services';
import {
  GOOGLE_CALLBACK_ERROR_PATH,
  GOOGLE_CALLBACK_SUCCESS_PATH,
} from './constants';
import {
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  SELF_SERVICE_ROLES,
  SignupDto,
  UpdatePasswordDto,
  UpdateProfileDto,
} from './dto';
import { GoogleInitGuard } from './guards';
import type {
  AuthPrincipal,
  AuthResult,
  GoogleProfile,
  RefreshPrincipal,
} from './types';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const AVATAR_MIME_TYPES = /^image\/(jpeg|png|webp|gif)$/;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

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
    clearAuthCookies(res, getAppConfig(this.configService));
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
  @ApiOperation({
    summary: 'Update the signed-in user’s own name/email/avatar',
    description:
      'Accepts either JSON or multipart/form-data. Send multipart with an ' +
      '"avatar" file field to also replace the profile picture.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'New profile picture (jpeg/png/webp/gif, max 5MB)',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOkResponse({ type: User })
  updateProfile(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdateProfileDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: AVATAR_MIME_TYPES })
        .addMaxSizeValidator({ maxSize: MAX_AVATAR_SIZE_BYTES })
        .build({ fileIsRequired: false }),
    )
    avatar?: Express.Multer.File,
  ): Promise<User> {
    return this.authService.updateProfile(principal.id, dto, avatar);
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
  @ResponseMessage('OTP sent to your email')
  @ApiOperation({
    summary: 'Email a one-time password to reset the account password',
  })
  @ApiNotFoundResponse({
    description: 'No account exists with the given email address',
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
    const config = getAppConfig(this.configService);

    try {
      const result = await this.authService.loginWithGoogle(profile);
      setAuthCookies(res, config, result.tokens);
      res.redirect(`${config.auth.frontendUrl}${GOOGLE_CALLBACK_SUCCESS_PATH}`);
    } catch (error) {
      this.logger.warn(
        `Google OAuth callback failed: ${(error as Error).message}`,
      );
      res.redirect(`${config.auth.frontendUrl}${GOOGLE_CALLBACK_ERROR_PATH}`);
    }
  }

  // ----------------------------------------------------------------- helpers

  private attachSession(res: Response, result: AuthResult): User {
    setAuthCookies(res, getAppConfig(this.configService), result.tokens);
    return result.user;
  }
}
