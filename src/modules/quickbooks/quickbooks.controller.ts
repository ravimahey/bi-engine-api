import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
  Public,
  Roles,
} from '@common/decorators';
import { UserRole } from '@modules/users/entities';
import {
  QuickbooksCallbackQueryDto,
  QuickbooksCdcQueryDto,
  QuickbooksConnectQueryDto,
  QuickbooksPollDto,
  QuickbooksReportParamsDto,
  QuickbooksReportQueryDto,
  QuickbooksSyncStatusQueryDto,
  QuickbooksSyncStatusResultDto,
} from './dto';
import {
  QuickbooksAuthService,
  QuickbooksPollingService,
  QuickbooksReportsService,
  QuickbooksService,
  QuickbooksSyncStatusService,
} from './services';

@ApiTags('QuickBooks')
@Controller('quickbooks')
export class QuickbooksController {
  constructor(
    private readonly quickbooksAuth: QuickbooksAuthService,
    private readonly quickbooksService: QuickbooksService,
    private readonly quickbooksReports: QuickbooksReportsService,
    private readonly quickbooksPolling: QuickbooksPollingService,
    private readonly quickbooksSyncStatus: QuickbooksSyncStatusService,
  ) {}

  @Get('connect')
  @ApiOperation({
    summary:
      'Start the QuickBooks OAuth consent flow (redirects to Intuit) — must be your own organization, unless admin',
  })
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuickbooksConnectQueryDto,
    @Res() res: Response,
  ): void {
    res.redirect(this.quickbooksAuth.getAuthUri(query.organizationId, user));
  }

  @Get('connection-status')
  @ApiOperation({
    summary:
      'Whether QuickBooks is connected for an organization — must be your own organization, unless admin',
  })
  getConnectionStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuickbooksConnectQueryDto,
  ) {
    return this.quickbooksAuth.getConnectionStatus(query.organizationId, user);
  }

  @Delete('connection')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Disconnect QuickBooks for an organization — must be your own organization, unless admin',
  })
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuickbooksConnectQueryDto,
  ): Promise<void> {
    return this.quickbooksAuth.disconnect(query.organizationId, user);
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

  @Roles(UserRole.ADMIN)
  @Get('vendors')
  @ApiOperation({ summary: 'List QuickBooks vendors (supplier master data)' })
  getVendors() {
    return this.quickbooksService.getVendors();
  }

  @Roles(UserRole.ADMIN)
  @Get('accounts')
  @ApiOperation({ summary: 'List QuickBooks chart-of-accounts entries' })
  getAccounts() {
    return this.quickbooksService.getAccounts();
  }

  @Roles(UserRole.ADMIN)
  @Get('items')
  @ApiOperation({ summary: 'List QuickBooks products/services (items)' })
  getItems() {
    return this.quickbooksService.getItems();
  }

  @Roles(UserRole.ADMIN)
  @Get('tax-codes')
  @ApiOperation({ summary: 'List QuickBooks tax codes' })
  getTaxCodes() {
    return this.quickbooksService.getTaxCodes();
  }

  @Roles(UserRole.ADMIN)
  @Get('tax-rates')
  @ApiOperation({ summary: 'List QuickBooks tax rates' })
  getTaxRates() {
    return this.quickbooksService.getTaxRates();
  }

  @Roles(UserRole.ADMIN)
  @Get('vendor-credits')
  @ApiOperation({ summary: 'List QuickBooks vendor credits (refunds)' })
  getVendorCredits() {
    return this.quickbooksService.getVendorCredits();
  }

  @Roles(UserRole.ADMIN)
  @Get('bill-payments')
  @ApiOperation({ summary: 'List QuickBooks bill payments' })
  getBillPayments() {
    return this.quickbooksService.getBillPayments();
  }

  @Roles(UserRole.ADMIN)
  @Get('customers')
  @ApiOperation({
    summary: 'List QuickBooks customers (revenue-side master data)',
  })
  getCustomers() {
    return this.quickbooksService.getCustomers();
  }

  @Roles(UserRole.ADMIN)
  @Get('sales-receipts')
  @ApiOperation({ summary: 'List QuickBooks sales receipts (point-of-sale)' })
  getSalesReceipts() {
    return this.quickbooksService.getSalesReceipts();
  }

  @Roles(UserRole.ADMIN)
  @Get('payments')
  @ApiOperation({ summary: 'List QuickBooks payments (invoice payments)' })
  getPayments() {
    return this.quickbooksService.getPayments();
  }

  @Post('poll')
  @ApiOperation({
    summary:
      'Full step-by-step sync for a date range: CompanyInfo always first, then Vendor/Account/Item/TaxRate/TaxCode/Customer master data, then Bill/Purchase/VendorCredit/BillPayment spend transactions, then Invoice/SalesReceipt/Payment revenue transactions — resuming from each entity’s own SyncCursor. Runs every entity by default; `entities` narrows it for admin debugging only. Must be your own organization, unless admin.',
  })
  poll(@CurrentUser() user: AuthenticatedUser, @Body() dto: QuickbooksPollDto) {
    return this.quickbooksPolling.poll(dto, user);
  }

  @Get('sync-status')
  @ApiOperation({
    summary:
      'Last-synced timestamp + cursor per QuickBooks entity (Vendor, Bill, Invoice, …), so the frontend can show how fresh the canonical data is — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: QuickbooksSyncStatusResultDto })
  getSyncStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuickbooksSyncStatusQueryDto,
  ) {
    return this.quickbooksSyncStatus.getSyncStatus(query, user);
  }

  @Roles(UserRole.ADMIN)
  @Get('changes')
  @ApiOperation({
    summary: 'Change Data Capture — entities changed since a given timestamp',
  })
  getChanges(@Query() query: QuickbooksCdcQueryDto) {
    return this.quickbooksReports.getChangeDataCapture(
      query.entities,
      query.changedSince,
    );
  }

  @Roles(UserRole.ADMIN)
  @Get('reports/:reportName')
  @ApiOperation({
    summary:
      "Cross-check a QuickBooks pre-aggregated report against this module's own totals",
  })
  getReport(
    @Param() params: QuickbooksReportParamsDto,
    @Query() query: QuickbooksReportQueryDto,
  ) {
    return this.quickbooksReports.getReport(params.reportName, query);
  }
}
