import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public, Roles } from '@common/decorators';
import { UserRole } from '@modules/users/entities';
import { QuickbooksCallbackQueryDto } from './dto';
import { QuickbooksAuthService, QuickbooksService } from './services';

@ApiTags('QuickBooks')
@Controller('quickbooks')
export class QuickbooksController {
  constructor(
    private readonly quickbooksAuth: QuickbooksAuthService,
    private readonly quickbooksService: QuickbooksService,
  ) {}

  @Roles(UserRole.ADMIN)
  @Get('connect')
  @ApiOperation({
    summary: 'Start the QuickBooks OAuth consent flow (redirects to Intuit)',
  })
  connect(@Res() res: Response): void {
    res.redirect(this.quickbooksAuth.getAuthUri());
  }

  // Public: Intuit redirects the browser here with no session of ours to
  // present. The signed `state` param (verified inside handleCallback) is
  // what actually protects this leg, not the auth guard.
  @Public()
  @Get('callback')
  @ApiOperation({
    summary:
      'QuickBooks OAuth callback — persists tokens and redirects to the frontend',
  })
  async callback(
    @Query() query: QuickbooksCallbackQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const redirectUrl = await this.quickbooksAuth.handleCallback(
      req.query as Record<string, string>,
      query,
    );
    res.redirect(redirectUrl);
  }

  @Roles(UserRole.ADMIN)
  @Get('company-info')
  @ApiOperation({ summary: 'Fetch the connected QuickBooks company profile' })
  getCompanyInfo() {
    return this.quickbooksService.getCompanyInfo();
  }

  @Roles(UserRole.ADMIN)
  @Get('expenses')
  @ApiOperation({ summary: 'List QuickBooks purchases (expenses)' })
  getExpenses() {
    return this.quickbooksService.getExpenses();
  }

  @Roles(UserRole.ADMIN)
  @Get('invoices')
  @ApiOperation({ summary: 'List QuickBooks invoices' })
  getInvoices() {
    return this.quickbooksService.getInvoices();
  }

  @Roles(UserRole.ADMIN)
  @Get('bills')
  @ApiOperation({ summary: 'List QuickBooks bills' })
  getBills() {
    return this.quickbooksService.getBills();
  }
}
