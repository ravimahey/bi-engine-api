import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from '@modules/users/dto';

/**
 * Self-service profile edit: no `password` (dedicated change-password endpoint),
 * no `role`/`isActive` (privilege fields — only an admin may change those).
 */
export class UpdateProfileDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'role', 'isActive'] as const),
) {}
