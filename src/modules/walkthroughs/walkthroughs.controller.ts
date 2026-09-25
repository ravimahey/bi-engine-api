import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
  ResponseMessage,
} from '@common/decorators';
import { TourKeyParamDto, UpdateWalkthroughDto } from './dto';
import { UserWalkthrough } from './entities';
import { WalkthroughsService } from './services';

/**
 * The signed-in user's own guided-tour progress. Open to every role (no
 * `@Roles`) — admins, suppliers, buyers and support users all get tours,
 * and every route only ever touches the caller's own rows.
 */
@ApiTags('Walkthroughs')
@ApiBearerAuth('access-token')
@Controller('walkthroughs/me')
export class WalkthroughsController {
  constructor(private readonly walkthroughsService: WalkthroughsService) {}

  @Get()
  @ResponseMessage('Walkthrough progress fetched successfully')
  @ApiOperation({ summary: "List the caller's progress on every tour" })
  @ApiOkResponse({ type: UserWalkthrough, isArray: true })
  list(@CurrentUser() user: AuthenticatedUser): Promise<UserWalkthrough[]> {
    return this.walkthroughsService.listForUser(user.id);
  }

  @Put(':tourKey')
  @ResponseMessage('Walkthrough progress saved successfully')
  @ApiOperation({
    summary: "Create or update the caller's progress on one tour",
  })
  @ApiOkResponse({ type: UserWalkthrough })
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { tourKey }: TourKeyParamDto,
    @Body() dto: UpdateWalkthroughDto,
  ): Promise<UserWalkthrough> {
    return this.walkthroughsService.upsert(user.id, tourKey, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset every tour for the caller so onboarding replays',
  })
  @ApiNoContentResponse()
  reset(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.walkthroughsService.resetForUser(user.id);
  }
}
