import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @ApiProperty({ example: 'Old!Str0ng!Passw0rd' })
  @IsString()
  @MinLength(1)
  oldPassword: string;

  @ApiProperty({ example: 'New!Str0ng!Passw0rd' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'password must contain an uppercase letter, a lowercase letter and a digit',
  })
  newPassword: string;
}
