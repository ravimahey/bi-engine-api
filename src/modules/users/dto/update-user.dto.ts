import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

/**
 * Every CreateUserDto rule stays in force, but each field becomes optional.
 * Password changes go through a dedicated endpoint, so it is omitted here.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {}
