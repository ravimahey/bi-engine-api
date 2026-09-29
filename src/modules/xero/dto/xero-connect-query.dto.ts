import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Query param for `GET /xero/connect` (and the other organization-scoped
 * Xero endpoints) — which organization this is for. On connect it's carried
 * through Xero's redirect inside the signed `state` (see `buildOAuthState`),
 * not trusted again on the way back.
 */
export class XeroConnectQueryDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Organization the Xero connection belongs to',
  })
  @IsUUID('4')
  organizationId: string;
}
