import { randomInt } from 'node:crypto';

const OTP_MIN = 0;
const OTP_MAX = 1_000_000;
const OTP_LENGTH = 6;
const MS_PER_MINUTE = 60_000;

/** A random numeric one-time password, zero-padded to a fixed width. */
export const generateOtp = (): string =>
  randomInt(OTP_MIN, OTP_MAX).toString().padStart(OTP_LENGTH, '0');

export const minutesToMs = (minutes: number): number => minutes * MS_PER_MINUTE;
