import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SELF_SERVICE_ROLES } from './signup.dto';

export class GoogleLoginDto {
  @ApiProperty({
    description:
      'Google ID token (the `credential` returned by Google Identity Services)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  idToken: string;

  @ApiPropertyOptional({
    enum: SELF_SERVICE_ROLES,
    description:
      'Role for a brand-new account; ignored if the Google account already exists. Defaults to buyer.',
  })
  @IsOptional()
  @IsIn(SELF_SERVICE_ROLES, {
    message: `role must be one of: ${SELF_SERVICE_ROLES.join(', ')}`,
  })
  role?: (typeof SELF_SERVICE_ROLES)[number];
}
