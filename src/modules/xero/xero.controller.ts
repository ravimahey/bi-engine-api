import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
  Public,
  RequestTimeout,
  Roles,
} from '@common/decorators';
import { UserRole } from '@modules/users/entities';
import {
  XeroCallbackQueryDto,
  XeroConnectQueryDto,
  XeroPollDto,
  XeroSyncStatusResultDto,
} from './dto';
import { XERO_POLL_TIMEOUT_MS } from './constants';
import {
  XeroAuthService,
  XeroPollingService,
  XeroService,
  XeroSyncStatusService,
  XeroWebhookService,
} from './services';

@ApiTags('Xero')
@Controller('xero')
export class XeroController {
  constructor(
    private readonly xeroAuth: XeroAuthService,
    private readonly xeroService: XeroService,
    private readonly xeroPolling: XeroPollingService,
    private readonly xeroSyncStatus: XeroSyncStatusService,
    private readonly xeroWebhook: XeroWebhookService,
  ) {}

  @Get('connect')
  @ApiOperation({
    summary:
      'Start the Xero OAuth consent flow (redirects to Xero) — must be your own organization, unless admin',
  })
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: XeroConnectQueryDto,
    @Res() res: Response,
  ): void {
    res.redirect(this.xeroAuth.getAuthUri(query.organizationId, user));
  }

  // Public: Xero redirects the browser here with no session of ours. The
  // signed `state` (verified in handleCallback) protects this leg instead.
  @Public()
  @Get('callback')
  @ApiOperation({
    summary:
      'Xero OAuth callback — exchanges the code, resolves the tenant, stores tokens, redirects to the frontend',
  })
  async callback(
    @Query() query: XeroCallbackQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(await this.xeroAuth.handleCallback(query));
  }

  @Get('connection-status')
  @ApiOperation({
    summary:
      'Whether Xero is connected for an organization — must be your own organization, unless admin',
  })
  getConnectionStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: XeroConnectQueryDto,
  ) {
    return this.xeroAuth.getConnectionStatus(query.organizationId, user);
  }

  @Delete('connection')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Disconnect Xero (revokes tokens at Xero) — must be your own organization, unless admin',
  })
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: XeroConnectQueryDto,
  ): Promise<void> {
    return this.xeroAuth.disconnect(query.organizationId, user);
  }

  @Roles(UserRole.ADMIN)
  @Get('organisation')
  @ApiOperation({
    summary:
      'Fetch the connected Xero organisation live — verifies the auth chain end to end (Step 0/1)',
  })
  getOrganisation(@Query() query: XeroConnectQueryDto) {
    return this.xeroService.getOrganisation(query.organizationId);
  }

  @Post('poll')
  @RequestTimeout(XERO_POLL_TIMEOUT_MS)
  @ApiOperation({
    summary:
      'Sync Xero into the canonical records: Organisation first, then Contacts/Accounts/Items/TaxRates, then ACCPAY Invoices, SPEND BankTransactions, ACCPAYCREDIT CreditNotes and bill Payments. Incremental via If-Modified-Since after the first run; `fullSync` forces a reconciliation pull. Must be your own organization, unless admin.',
  })
  poll(@CurrentUser() user: AuthenticatedUser, @Body() dto: XeroPollDto) {
    return this.xeroPolling.poll(dto, user);
  }

  @Get('sync-status')
  @ApiOperation({
    summary:
      'Cursor + last-synced time per Xero entity — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: XeroSyncStatusResultDto })
  getSyncStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: XeroConnectQueryDto,
  ) {
    return this.xeroSyncStatus.getSyncStatus(query.organizationId, user);
  }

  // Public + unthrottled: called by Xero, authenticated by the HMAC
  // signature over the raw body instead. Answers with a bare status code —
  // 200 for a valid signature, 401 otherwise — as Xero's intent-to-receive
  // check requires.
  @Public()
  @SkipThrottle()
  @Post('webhook')
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-xero-signature') signature: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const accepted = await this.xeroWebhook.handle(req.rawBody, signature);
    res.status(accepted ? HttpStatus.OK : HttpStatus.UNAUTHORIZED).end();
  }
}
