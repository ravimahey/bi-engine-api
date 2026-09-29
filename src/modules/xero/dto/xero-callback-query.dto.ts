import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Query params Xero appends to the redirect back to `GET /xero/callback`.
 * On consent it sends `code`; if the user cancels it sends `error` instead,
 * so both are optional here and the service decides which case it is.
 */
export class XeroCallbackQueryDto {
  @ApiPropertyOptional({
    description: 'Authorization code to exchange for tokens',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ description: 'Signed CSRF state minted by /xero/connect' })
  @IsString()
  state: string;

  @ApiPropertyOptional({ description: 'Set by Xero when consent was denied' })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({ description: 'Granted scopes, space-separated' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ description: 'OIDC session state, unused' })
  @IsOptional()
  @IsString()
  session_state?: string;
}
