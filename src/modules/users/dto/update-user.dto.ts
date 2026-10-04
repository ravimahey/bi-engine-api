import { ApiHideProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Equals } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/**
 * Every CreateUserDto rule stays in force, but each field becomes optional.
 * Password changes go through a dedicated endpoint, so it is omitted here.
 *
 * Email is immutable once an account exists — for the user themselves and
 * for an admin alike. Rather than letting the global whitelist reject it
 * with a generic "should not exist", any `email` sent here fails with an
 * explicit message. (The column is also `update: false` on the entity, so
 * nothing past this DTO can change it either.)
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'email'] as const),
) {
  @ApiHideProperty()
  @Equals(undefined, { message: 'email cannot be changed' })
  email?: never;
}
