import { Injectable } from '@nestjs/common';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;
const SALT_LENGTH_BYTES = 16;
const HASH_PARTS_SEPARATOR = ':';

/** Promise wrapper around scrypt — promisify() loses the types on its overloads. */
const scrypt = (
  password: string,
  salt: Buffer,
  keylen: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, (error, derivedKey) =>
      error ? reject(error) : resolve(derivedKey),
    );
  });

/**
 * Password hashing/verification, split out of `UsersService` — pure crypto
 * with no repository dependency, so it doesn't belong on a persistence
 * service (see CLAUDE.md "Keep files small").
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH_BYTES);
    const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH);

    return `${salt.toString('hex')}${HASH_PARTS_SEPARATOR}${derived.toString('hex')}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const [saltHex, keyHex] = storedHash.split(HASH_PARTS_SEPARATOR);
    if (!saltHex || !keyHex) return false;

    const derived = await scrypt(
      password,
      Buffer.from(saltHex, 'hex'),
      SCRYPT_KEY_LENGTH,
    );
    const stored = Buffer.from(keyHex, 'hex');

    return derived.length === stored.length && timingSafeEqual(derived, stored);
  }
}
