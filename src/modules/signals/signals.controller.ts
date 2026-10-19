import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
  ResponseMessage,
} from '@common/decorators';
import { IdParamDto } from '@common/dto';
import {
  PriceClarificationDto,
  PriceNegotiationDto,
  QuerySignalsDto,
  RevisedAgreementDto,
  SignalCountDto,
  SignalFeedDto,
  UpdateSignalDto,
  VerifyInvoiceDto,
  ResolveWithoutNegotiationDto,
} from './dto';
import { Signal } from './entities';
import { SignalsFeedService, SupplierPriceIncreaseService } from './services';

/**
 * The signed-in user's attention inbox and supplier price increase resolution.
 */
@ApiTags('Signals')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Caller has no organization yet' })
@Controller('signals')
export class SignalsController {
  constructor(
    private readonly feed: SignalsFeedService,
    private readonly priceIncreaseService: SupplierPriceIncreaseService,
  ) {}

  @Get()
  @ResponseMessage('Signals fetched successfully')
  @ApiOperation({
    summary:
      "The caller's organization's signals, newest first, cursor-paginated",
  })
  @ApiOkResponse({ type: SignalFeedDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuerySignalsDto,
  ): Promise<SignalFeedDto> {
    return this.feed.list(user, query);
  }

  @Get('count')
  @ResponseMessage('Signal count fetched successfully')
  @ApiOperation({ summary: 'Unread signal count for the navigation badge' })
  @ApiOkResponse({ type: SignalCountDto })
  count(@CurrentUser() user: AuthenticatedUser): Promise<SignalCountDto> {
    return this.feed.countUnread(user);
  }

  @Post('detect-price-increase')
  @ResponseMessage('Price increase detection completed')
  @ApiOperation({
    summary:
      'Detect supplier price increases from QuickBooks invoice data against agreed catalog baseline',
  })
  @ApiOkResponse({ type: [Signal] })
  detectPriceIncrease(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Signal[]> {
    return this.priceIncreaseService.detectPriceIncreases(user.organizationId!);
  }

  @Post('seed-prawns-test-case')
  @ResponseMessage('Prawns test case seeded successfully')
  @ApiOperation({
    summary:
      'Seed Scenario 1 test case (prawns $14 to $16 for 200 kg = $400 cost) and generate signal',
  })
  @ApiOkResponse({ type: Signal })
  seedPrawnsTestCase(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Signal> {
    return this.priceIncreaseService.seedPrawnsTestCase(user);
  }

  @Get(':id')
  @ResponseMessage('Signal fetched successfully')
  @ApiOperation({ summary: 'Get single signal details with metadata' })
  @ApiOkResponse({ type: Signal })
  @ApiNotFoundResponse({ description: 'No such signal in your organization' })
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<Signal> {
    return this.feed.getOne(user, id);
  }

  @Patch(':id')
  @ResponseMessage('Signal updated successfully')
  @ApiOperation({ summary: 'Mark a signal as read, or dismiss it' })
  @ApiOkResponse({ type: Signal })
  @ApiNotFoundResponse({ description: 'No such signal in your organization' })
  @ApiConflictResponse({ description: 'Signal is already dismissed' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateSignalDto,
  ): Promise<Signal> {
    return this.feed.updateStatus(user, id, dto.status);
  }

  @Post(':id/price-clarification')
  @ResponseMessage('Price clarification sent to supplier')
  @ApiOperation({
    summary: 'Buyer sends price clarification inquiry for detected price increase',
  })
  @ApiOkResponse({ type: Signal })
  requestClarification(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: PriceClarificationDto,
  ): Promise<Signal> {
    return this.priceIncreaseService.requestClarification(user, id, dto);
  }

  @Post(':id/price-negotiation')
  @ResponseMessage('Supplier negotiation response recorded')
  @ApiOperation({
    summary: 'Record supplier response or counter-offer during price negotiation',
  })
  @ApiOkResponse({ type: Signal })
  recordNegotiation(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: PriceNegotiationDto,
  ): Promise<Signal> {
    return this.priceIncreaseService.recordNegotiation(user, id, dto);
  }

  @Post(':id/revised-agreement')
  @ResponseMessage('Revised price agreement confirmed')
  @ApiOperation({
    summary:
      'Confirm revised price agreement and calculate savings against original invoice ($300 at $14.50/kg)',
  })
  @ApiOkResponse({ type: Signal })
  recordRevisedAgreement(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: RevisedAgreementDto,
  ): Promise<Signal> {
    return this.priceIncreaseService.recordRevisedAgreement(user, id, dto);
  }

  @Post(':id/verify-invoice')
  @ResponseMessage('Final invoice verified successfully')
  @ApiOperation({
    summary:
      'Verify corrected invoice or credit note against revised agreement',
  })
  @ApiOkResponse({ type: Signal })
  verifyInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: VerifyInvoiceDto,
  ): Promise<Signal> {
    return this.priceIncreaseService.verifyInvoice(user, id, dto);
  }

  @Post(':id/resolve-without-negotiation')
  @ResponseMessage('Finding resolved directly without negotiation')
  @ApiOperation({
    summary:
      'Directly resolve a supplier price increase finding without negotiations (e.g. accepted as valid contract rate or waived)',
  })
  @ApiOkResponse({ type: Signal })
  resolveWithoutNegotiation(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: ResolveWithoutNegotiationDto,
  ): Promise<Signal> {
    return this.priceIncreaseService.resolveWithoutNegotiation(user, id, dto);
  }
}
