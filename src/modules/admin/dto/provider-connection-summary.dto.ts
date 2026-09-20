import { ApiProperty } from '@nestjs/swagger';
import { ConnectionStatus, ProviderType } from '@modules/providers/entities';

export class ProviderConnectionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ProviderType })
  provider: ProviderType;

  @ApiProperty({ enum: ConnectionStatus })
  status: ConnectionStatus;

  @ApiProperty({ nullable: true, type: String })
  lastError: string | null;

  @ApiProperty({ nullable: true, type: Date })
  connectedAt: Date | null;
}
