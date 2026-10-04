import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  BUSINESS_GOALS,
  BUSINESS_TYPES,
  COUNTRY_CODES,
  LOCATION_COUNTS,
  MONTHLY_VOLUMES,
  ONBOARDING_INTEGRATIONS,
} from '../constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Business details collected by the onboarding wizard. Every field is
 * optional on the wire (admins can still create a bare name-only
 * organization); the self-serve UI makes them required. Shape rules live
 * here; cross-field rules that depend on `country` (region list, postcode
 * format, time zone, ABN) are enforced by `OrganizationProfileService`,
 * because a PATCH may change one without resending the other.
 */
export class OrganizationProfileDto {
  @ApiPropertyOptional({ example: 'Riverside Kitchen', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  tradingName?: string | null;

  @ApiPropertyOptional({
    example: '12 345 678 901',
    maxLength: 50,
    description: 'ABN/ACN for Australia; the local business number elsewhere',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(trim)
  businessNumber?: string | null;

  @ApiPropertyOptional({ enum: COUNTRY_CODES, example: 'AU' })
  @IsOptional()
  @IsIn(COUNTRY_CODES)
  country?: string | null;

  @ApiPropertyOptional({ example: 'VIC', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  region?: string | null;

  @ApiPropertyOptional({ example: '12 Collins St', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  streetAddress?: string | null;

  @ApiPropertyOptional({ example: 'Melbourne', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  city?: string | null;

  @ApiPropertyOptional({ example: '3000', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Transform(trim)
  postcode?: string | null;

  @ApiPropertyOptional({ example: 'Australia/Sydney', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string | null;

  @ApiPropertyOptional({ enum: BUSINESS_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(BUSINESS_TYPES.length)
  @IsIn(BUSINESS_TYPES, { each: true })
  businessTypes?: string[];

  @ApiPropertyOptional({ enum: LOCATION_COUNTS })
  @IsOptional()
  @IsIn(LOCATION_COUNTS)
  locationCount?: string | null;

  @ApiPropertyOptional({ enum: MONTHLY_VOLUMES })
  @IsOptional()
  @IsIn(MONTHLY_VOLUMES)
  monthlyVolume?: string | null;

  @ApiPropertyOptional({ enum: BUSINESS_GOALS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(BUSINESS_GOALS.length)
  @IsIn(BUSINESS_GOALS, { each: true })
  goals?: string[];

  @ApiPropertyOptional({ enum: ONBOARDING_INTEGRATIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(ONBOARDING_INTEGRATIONS.length)
  @IsIn(ONBOARDING_INTEGRATIONS, { each: true })
  integrations?: string[];
}
