import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Query params Intuit appends to the redirect back to `GET /quickbooks/callback`. */
export class QuickbooksCallbackQueryDto {
  @ApiProperty({ description: 'Authorization code to exchange for tokens' })
  @IsString()
  code: string;

  @ApiProperty({
    description: 'Signed CSRF state minted by /quickbooks/connect',
  })
  @IsString()
  state: string;

  @ApiProperty({ description: 'QuickBooks company id the tokens belong to' })
  @IsString()
  realmId: string;
}
