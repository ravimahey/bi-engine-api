import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '@config';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../constants/app.constants';

const DURATION_UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Turns a jsonwebtoken-style duration ('15m', '7d', '30s') into milliseconds. */
export const parseDurationMs = (value: string): number => {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
  if (!match) {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber * 1000 : 0;
  }
  const [, amount, unit] = match;
  return Number(amount) * DURATION_UNITS[unit.toLowerCase()];
};

/**
 * Shared options for both auth cookies. `secure`/`sameSite` are driven by
 * environment so local http:// dev still works while production is locked down.
 */
const baseCookieOptions = (config: AppConfig): CookieOptions => ({
  httpOnly: true,
  secure: config.isProduction,
  // Cross-subdomain deployments (api.ordara.com / app.ordara.com) need 'none' +
  // secure to carry the cookie; same-site localhost dev is fine with 'lax'.
  sameSite: config.isProduction ? 'none' : 'lax',
  domain: config.auth.cookieDomain,
  path: '/',
});

/** Sets the access + refresh httpOnly cookies after a login/signup/refresh. */
export const setAuthCookies = (
  res: Response,
  config: AppConfig,
  tokens: { accessToken: string; refreshToken: string },
): void => {
  const base = baseCookieOptions(config);
  const authPrefix = `/${config.apiPrefix}/v1/auth`;

  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: parseDurationMs(config.auth.accessExpiresIn),
  });

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    // Scoped to the auth routes that actually need it (refresh/logout) so it
    // never rides along on unrelated API requests.
    path: authPrefix,
    maxAge: parseDurationMs(config.auth.refreshExpiresIn),
  });
};

/** Clears both auth cookies on logout — options must mirror how they were set. */
export const clearAuthCookies = (res: Response, config: AppConfig): void => {
  const base = baseCookieOptions(config);
  const authPrefix = `/${config.apiPrefix}/v1/auth`;

  res.clearCookie(ACCESS_TOKEN_COOKIE, base);
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...base, path: authPrefix });
};
