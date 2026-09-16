import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from 'node:crypto';

const ALGORITHM: CipherGCMTypes = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit nonce, the recommended size for GCM
const REQUIRED_KEY_LENGTH_BYTES = 32; // AES-256

/**
 * At-rest encryption for provider OAuth tokens (`ProviderConnection.accessToken`
 * / `refreshToken`). TypeORM column transformers run outside Nest's DI
 * container, so the key is resolved from `process.env` directly rather than
 * through `ConfigService` — this is the one place in the app allowed to do
 * that; every other consumer of config still goes through `getAppConfig()`.
 */

/** Encodes `<iv>:<authTag>:<ciphertext>`, each hex, into one text column. */
export const encryptToken = (plainText: string, key: Buffer): string => {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext]
    .map((part) => part.toString('hex'))
    .join(':');
};

export const decryptToken = (payload: string, key: Buffer): string => {
  const [ivHex, authTagHex, ciphertextHex] = payload.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted token payload');
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
};

/**
 * Resolves the configured `TOKEN_ENCRYPTION_KEY` secret (hex or base64) into
 * the 32-byte buffer AES-256-GCM needs, failing loudly rather than silently
 * truncating/padding a misconfigured key.
 */
export const resolveTokenEncryptionKey = (secret: string): Buffer => {
  const key =
    secret.length === 64 && /^[0-9a-f]+$/i.test(secret)
      ? Buffer.from(secret, 'hex')
      : Buffer.from(secret, 'base64');

  if (key.length !== REQUIRED_KEY_LENGTH_BYTES) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256) — ' +
        'generate one with `openssl rand -hex 32`',
    );
  }

  return key;
};
