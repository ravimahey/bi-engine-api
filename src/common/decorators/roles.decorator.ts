import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/app.constants';

/**
 * `@Roles(UserRole.ADMIN)` — consumed by a RolesGuard via `Reflector`.
 *
 * Typed as `string` rather than a feature-specific enum so that `common/` never
 * depends on `modules/`; string enums still pass with full type-checking.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
