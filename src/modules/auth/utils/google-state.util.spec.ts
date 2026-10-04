import { UserRole } from '@modules/users/entities';
import { buildGoogleState, parseGoogleState } from './google-state.util';

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('google-state util', () => {
  it('round-trips each self-service role', () => {
    for (const role of [UserRole.OWNER, UserRole.SUPPORT]) {
      expect(parseGoogleState(buildGoogleState(role))).toBe(role);
    }
  });

  it('defaults a missing or unknown role to owner', () => {
    expect(parseGoogleState(buildGoogleState(undefined))).toBe(UserRole.OWNER);
    expect(parseGoogleState(buildGoogleState('buyer'))).toBe(UserRole.OWNER);
    expect(parseGoogleState(buildGoogleState('supplier'))).toBe(UserRole.OWNER);
  });

  it('never lets the state grant admin', () => {
    expect(parseGoogleState(buildGoogleState(UserRole.ADMIN))).toBe(
      UserRole.OWNER,
    );
    expect(parseGoogleState(encode({ role: UserRole.ADMIN }))).toBe(
      UserRole.OWNER,
    );
  });

  it('falls back to owner for absent or malformed state', () => {
    expect(parseGoogleState(undefined)).toBe(UserRole.OWNER);
    expect(parseGoogleState('')).toBe(UserRole.OWNER);
    expect(parseGoogleState('not-base64-json')).toBe(UserRole.OWNER);
  });
});
