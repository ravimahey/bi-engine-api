import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsIn } from 'class-validator';
import { QUICKBOOKS_QUERY_ENTITIES } from '../constants';
import type { QuickbooksQueryEntity } from '../types';

/** Query params for `GET /quickbooks/changes` — QuickBooks' Change Data Capture endpoint. */
export class QuickbooksCdcQueryDto {
  @ApiProperty({
    description: 'Comma-separated QuickBooks entities to check for changes',
    example: 'Bill,Purchase,Vendor',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.split(',').map((entity) => entity.trim())
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(QUICKBOOKS_QUERY_ENTITIES, { each: true })
  entities: QuickbooksQueryEntity[];

  @ApiProperty({
    description: 'Only return records changed since this timestamp (ISO 8601)',
    example: '2024-01-01T00:00:00Z',
  })
  @IsDateString()
  changedSince: string;
}
