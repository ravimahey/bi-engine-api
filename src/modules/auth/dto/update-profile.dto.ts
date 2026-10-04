import { OmitType } from '@nestjs/swagger';
import { UpdateUserDto } from '@modules/users/dto';

/**
 * Self-service profile edit: no `password` (dedicated change-password endpoint),
 * no `role`/`isActive` (privilege fields — only an admin may change those),
 * and no `email` (immutable — inherited rejection from `UpdateUserDto`).
 */
export class UpdateProfileDto extends OmitType(UpdateUserDto, [
  'role',
  'isActive',
] as const) {}
