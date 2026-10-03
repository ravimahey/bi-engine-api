import { ApiProperty } from '@nestjs/swagger';
import { Signal } from '../entities';

/** `GET /signals` — signals only, never embedded source data; the client links out via `sourceType` + `sourceId`. */
export class SignalFeedDto {
  @ApiProperty({ type: Signal, isArray: true })
  items: Signal[];

  @ApiProperty({
    nullable: true,
    description: 'Pass as `cursor` for the next page; null on the last page',
  })
  nextCursor: string | null;
}
