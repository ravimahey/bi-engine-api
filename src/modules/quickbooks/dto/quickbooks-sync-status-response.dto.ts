import { ApiProperty } from '@nestjs/swagger';
import { ConnectionStatus } from '@modules/providers/entities';
import { QUICKBOOKS_SYNC_STATUS_ENTITIES } from '../constants';

/** Swagger-only mirror of `QuickbooksSyncStatusEntity` so it renders in the docs. */
export class QuickbooksSyncStatusEntityDto {
  @ApiProperty({ enum: QUICKBOOKS_SYNC_STATUS_ENTITIES, example: 'Vendor' })
  entity: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '2026-09-16T18:04:00.000Z',
    description:
      'Null if this entity has never been synced for this connection',
  })
  lastSyncedAt: Date | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '2026-09-16T18:04:00.000Z',
    description:
      'Opaque provider checkpoint — an ISO changedSince timestamp for QuickBooks today',
  })
  cursor: string | null;
}

/** Swagger-only mirror of `QuickbooksSyncStatusResult` so it renders in the docs. */
export class QuickbooksSyncStatusResultDto {
  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({
    format: 'uuid',
    required: false,
    nullable: true,
    description: 'Null if this organization has never connected QuickBooks',
  })
  providerConnectionId: string | null;

  @ApiProperty({ enum: ConnectionStatus, required: false, nullable: true })
  connectionStatus: ConnectionStatus | null;

  @ApiProperty({ type: [QuickbooksSyncStatusEntityDto] })
  entities: QuickbooksSyncStatusEntityDto[];
}
