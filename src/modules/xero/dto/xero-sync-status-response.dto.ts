import { ApiProperty } from '@nestjs/swagger';
import { ConnectionStatus } from '@modules/providers/entities';
import { XERO_SYNC_STATUS_ENTITIES } from '../constants';

/** Swagger-only mirror of `XeroSyncStatusEntity`. */
export class XeroSyncStatusEntityDto {
  @ApiProperty({ enum: XERO_SYNC_STATUS_ENTITIES, example: 'Invoices' })
  entity: string;

  @ApiProperty({ required: false, nullable: true })
  lastSyncedAt: Date | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '2026-09-16T18:04:00.000Z',
    description:
      'The If-Modified-Since watermark for the next incremental pull',
  })
  cursor: string | null;
}

/** Swagger-only mirror of `XeroSyncStatusResult`. */
export class XeroSyncStatusResultDto {
  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  providerConnectionId: string | null;

  @ApiProperty({ enum: ConnectionStatus, required: false, nullable: true })
  connectionStatus: ConnectionStatus | null;

  @ApiProperty({ type: [XeroSyncStatusEntityDto] })
  entities: XeroSyncStatusEntityDto[];
}
