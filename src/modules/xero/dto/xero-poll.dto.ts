import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { XERO_POLL_ENTITY_ORDER } from '../constants';
import type { XeroPollEntity } from '../constants';

/**
 * Request body for `POST /xero/poll`. Unlike QuickBooks there's no required
 * date range: Xero syncs incrementally with `If-Modified-Since` off each
 * entity's stored cursor, and `fromDate` only bounds the history of a full pull.
 */
export class XeroPollDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Organization to sync — resolves the ProviderConnection to poll',
  })
  @IsUUID('4')
  organizationId: string;

  @ApiPropertyOptional({
    example: '2025-01-01',
    description:
      'Only pull transactions dated on/after this day (YYYY-MM-DD) on a full pull. Ignored for master data and for incremental pulls.',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Ignore stored cursors and re-pull everything — the reconciliation pass that catches edits If-Modified-Since misses',
  })
  @IsOptional()
  @IsBoolean()
  fullSync?: boolean;

  @ApiPropertyOptional({
    enum: XERO_POLL_ENTITY_ORDER,
    isArray: true,
    description:
      'Restrict the poll to these entities (default: all, always walked in dependency order)',
  })
  @IsOptional()
  @IsArray()
  @IsIn(XERO_POLL_ENTITY_ORDER, { each: true })
  entities?: XeroPollEntity[];
}
