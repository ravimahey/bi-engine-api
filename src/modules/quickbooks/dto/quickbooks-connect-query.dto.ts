import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Query param for `GET /quickbooks/connect` — which organization is
 * starting this OAuth flow. Carried securely through to the callback via
 * the signed `state` value (see `buildOAuthState`), not trusted again
 * on the way back.
 */
export class QuickbooksConnectQueryDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Organization initiating the QuickBooks connection',
  })
  @IsUUID('4')
  organizationId: string;
}
