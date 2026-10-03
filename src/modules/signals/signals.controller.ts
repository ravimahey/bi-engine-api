import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
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
  QuerySignalsDto,
  SignalCountDto,
  SignalFeedDto,
  UpdateSignalDto,
} from './dto';
import { Signal } from './entities';
import { SignalsFeedService } from './services';

/**
 * The signed-in user's attention inbox. Open to every role (no `@Roles`) —
 * each route only ever touches the caller's own organization's signals.
 * There is no create/delete here on purpose: signals are raised and
 * resolved by producers through `SignalsService`, never by clients.
 */
@ApiTags('Signals')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Caller has no organization yet' })
@Controller('signals')
export class SignalsController {
  constructor(private readonly feed: SignalsFeedService) {}

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
}
