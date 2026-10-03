import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SIGNALS_DEFAULT_LIMIT, SIGNALS_MAX_LIMIT } from '../constants';
import { SignalSeverity, SignalStatus, SignalType } from '../entities';
import { toStringArray } from '../utils';

/**
 * `GET /signals` filters. `status`, `type` and `severity` each take one or
 * more comma-separated values, so the inbox tabs are plain queries — e.g.
 * "Needs attention" is `status=unread,read&severity=warning,urgent`. There
 * is deliberately no `organizationId`: the feed is always the caller's own
 * organization.
 */
export class QuerySignalsDto {
  @ApiPropertyOptional({
    enum: SignalStatus,
    isArray: true,
    description: 'Comma-separated statuses; omitted = every status',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsEnum(SignalStatus, { each: true })
  status?: SignalStatus[];

  @ApiPropertyOptional({
    enum: SignalType,
    isArray: true,
    description: 'Comma-separated signal types',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsEnum(SignalType, { each: true })
  type?: SignalType[];

  @ApiPropertyOptional({
    enum: SignalSeverity,
    isArray: true,
    description: 'Comma-separated severities',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsEnum(SignalSeverity, { each: true })
  severity?: SignalSeverity[];

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Only signals created at or after this instant',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59.999Z',
    description: 'Only signals created at or before this instant',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: SIGNALS_MAX_LIMIT,
    default: SIGNALS_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(SIGNALS_MAX_LIMIT)
  limit: number = SIGNALS_DEFAULT_LIMIT;

  @ApiPropertyOptional({
    description: '`nextCursor` from the previous page; omitted = first page',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}
