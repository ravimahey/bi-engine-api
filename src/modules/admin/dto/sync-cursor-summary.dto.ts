import { ApiProperty } from '@nestjs/swagger';

export class SyncCursorSummaryDto {
  @ApiProperty({ format: 'uuid' })
  providerConnectionId: string;

  @ApiProperty({ example: 'Bill' })
  entityType: string;

  @ApiProperty({ example: '2026-09-12T00:00:00Z' })
  cursor: string;

  @ApiProperty({ nullable: true, type: Date })
  lastSyncedAt: Date | null;
}
