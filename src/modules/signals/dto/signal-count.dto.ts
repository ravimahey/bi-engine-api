import { ApiProperty } from '@nestjs/swagger';

/** `GET /signals/count` — powers the navigation badge. */
export class SignalCountDto {
  @ApiProperty({ example: 4 })
  unread: number;
}
