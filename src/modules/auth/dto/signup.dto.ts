import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@modules/users/entities';

/** Roles a visitor may self-assign on signup. Admin accounts are provisioned separately. */
export const SELF_SERVICE_ROLES = [UserRole.BUYER, UserRole.SUPPLIER] as const;

export class SignupDto {
  @ApiProperty({ example: 'ada@example.com', maxLength: 255 })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({ example: 'Ada', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  firstName: string;

  @ApiProperty({ example: 'Lovelace', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  lastName: string;

  @ApiProperty({ example: 'Str0ng!Passw0rd', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'password must contain an uppercase letter, a lowercase letter and a digit',
  })
  password: string;

  @ApiProperty({
    enum: SELF_SERVICE_ROLES,
    example: UserRole.BUYER,
    description: 'Admin accounts cannot be created through signup.',
  })
  @IsIn(SELF_SERVICE_ROLES, {
    message: `role must be one of: ${SELF_SERVICE_ROLES.join(', ')}`,
  })
  role: (typeof SELF_SERVICE_ROLES)[number];
}
