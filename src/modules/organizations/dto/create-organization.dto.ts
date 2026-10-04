import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrganizationProfileDto } from './organization-profile.dto';

export class CreateOrganizationDto extends OrganizationProfileDto {
  @ApiProperty({ example: 'Riverside Bistro', minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  @ApiPropertyOptional({
    example: 'riverside-bistro',
    minLength: 1,
    maxLength: 255,
    description:
      'URL-safe unique identifier — lowercase letters/digits/hyphens only. ' +
      'Omit it to have a unique slug generated from `name`.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, digits and single hyphens only',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  slug?: string;

  // No `= true` initializer: `UpdateOrganizationDto` is a `PartialType` of
  // this class and the global pipe runs with `exposeDefaultValues`, so an
  // initializer would silently re-activate the organization on every PATCH.
  // The column's own DB default (`true`) covers creation.
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
