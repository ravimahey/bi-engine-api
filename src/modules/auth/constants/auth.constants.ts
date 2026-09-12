/** Cloudinary folder profile pictures are stored under. */
export const AVATAR_FOLDER = 'ordara-analytics/avatars';

/** Fixed public id per user: every re-upload overwrites the same Cloudinary asset in place. */
export const avatarPublicId = (userId: string): string => `avatar-${userId}`;

export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_DEACTIVATED:
    'Your account has been deactivated. Contact an administrator.',
  SESSION_EXPIRED: 'Session expired, please log in again',
} as const;

/** Frontend routes the Google OAuth callback redirects to. */
export const GOOGLE_CALLBACK_SUCCESS_PATH = '/auth/callback';
export const GOOGLE_CALLBACK_ERROR_PATH =
  '/auth/login?error=google_auth_failed';
