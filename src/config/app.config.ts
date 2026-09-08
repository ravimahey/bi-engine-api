import { registerAs } from '@nestjs/config';
import { Environment } from './env.validation';

export interface AppConfig {
  env: Environment;
  port: number;
  apiPrefix: string;
  corsOrigins: string[] | boolean;
  requestTimeoutMs: number;
  throttle: { ttl: number; limit: number };
  swagger: { enabled: boolean; path: string };
  isProduction: boolean;
  auth: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
    googleClientId: string;
    googleClientSecret: string;
    googleCallbackUrl: string;
    frontendUrl: string;
    cookieDomain: string | undefined;
    otpExpiresInMinutes: number;
  };
  mail: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  };
}

export const APP_CONFIG_KEY = 'app';

export default registerAs(APP_CONFIG_KEY, (): AppConfig => {
  const env = (process.env.NODE_ENV as Environment) ?? Environment.Development;
  const rawOrigins = process.env.CORS_ORIGINS ?? '*';

  return {
    env,
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    corsOrigins:
      rawOrigins === '*'
        ? true
        : rawOrigins
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS ?? '30000', 10),
    throttle: {
      ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
    },
    swagger: {
      enabled: (process.env.SWAGGER_ENABLED ?? 'true') !== 'false',
      path: process.env.SWAGGER_PATH ?? 'docs',
    },
    isProduction: env === Environment.Production,
    auth: {
      // `||` on purpose below: an env var present but set to '' (e.g. an
      // unfilled `GOOGLE_CLIENT_ID=` line in .env) must fall back too — `??`
      // only catches null/undefined and would hand passport-google-oauth20 an
      // empty clientID, which throws at boot instead of degrading gracefully.
      accessSecret: process.env.JWT_ACCESS_SECRET!,
      refreshSecret: process.env.JWT_REFRESH_SECRET!,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      googleClientId: process.env.GOOGLE_CLIENT_ID || 'mock-client-id',
      googleClientSecret:
        process.env.GOOGLE_CLIENT_SECRET || 'mock-client-secret',
      googleCallbackUrl:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:3000/api/v1/auth/google/callback',
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
      cookieDomain: process.env.COOKIE_DOMAIN || undefined,
      otpExpiresInMinutes: parseInt(
        process.env.OTP_EXPIRES_MINUTES || '15',
        10,
      ),
    },
    mail: {
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
      from: process.env.SMTP_FROM || 'Ordara Analytics <noreply@ordara.com>',
    },
  };
});
