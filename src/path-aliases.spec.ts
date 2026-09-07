import { BaseEntity, buildPaginationMeta, IS_PUBLIC_KEY } from '@common';
import { APP_CONFIG_KEY, Environment } from '@config';
import { User } from '@modules/users/entities/user.entity';

/**
 * Guards the alias configuration: tsconfig `paths`, jest `moduleNameMapper` and
 * tsc-alias all have to agree, and this fails loudly if one drifts.
 */
describe('path aliases', () => {
  it('resolves @common, @config and @modules', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
    expect(APP_CONFIG_KEY).toBe('app');
    expect(Environment.Development).toBe('development');
    expect(buildPaginationMeta(10, 1, 5).totalPages).toBe(2);
    expect(new User()).toBeInstanceOf(BaseEntity);
  });
});
