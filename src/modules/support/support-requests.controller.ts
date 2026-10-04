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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  CurrentUser,
  type AuthenticatedUser,
  ResponseMessage,
  Roles,
} from '@common/decorators';
import { IdParamDto } from '@common/dto';
import { UserRole } from '@modules/users/entities';
import {
  CreateSupportRequestDto,
  QuerySupportRequestsDto,
  ReviewSupportRequestDto,
} from './dto';
import { SupportRequest } from './entities';
import { SupportRequestsService } from './services';

/**
 * A support user requesting access, and the org owner reviewing it. `POST /`
 * and `GET /me` are the support user's side; `GET /`, `GET /active`,
 * `PATCH /:id` and `PATCH /:id/revoke` are the owner's — `RolesGuard` keeps
 * each on its own side, `assertOwnOrganization` (inside the service) keeps
 * an owner to their own organization's requests.
 */
@ApiTags('Support')
@ApiBearerAuth('access-token')
@Controller('support/requests')
export class SupportRequestsController {
  constructor(
    private readonly supportRequestsService: SupportRequestsService,
  ) {}

  @Roles(UserRole.SUPPORT)
  @Post()
  @ResponseMessage('Support access requested successfully')
  @ApiOperation({
    summary: 'Request support access to an organization',
  })
  @ApiCreatedResponse({ type: SupportRequest })
  @ApiConflictResponse({
    description: 'Already a pending request for this organization',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupportRequestDto,
  ): Promise<SupportRequest> {
    return this.supportRequestsService.createRequest(dto, user);
  }

  @Roles(UserRole.SUPPORT)
  @Get('me')
  @ResponseMessage('Your support requests fetched successfully')
  @ApiOperation({ summary: "List the caller's own support access requests" })
  @ApiPaginatedResponse(SupportRequest)
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuerySupportRequestsDto,
  ) {
    return this.supportRequestsService.listMyRequests(user, query);
  }

  @Roles(UserRole.OWNER)
  @Get()
  @ResponseMessage('Incoming support requests fetched successfully')
  @ApiOperation({
    summary:
      "The caller's action inbox: only ever pending support access requests for their own organization — an already-approved/rejected request only shows up on the requester's own GET /support/requests/me. Any `status` filter is ignored here.",
  })
  @ApiPaginatedResponse(SupportRequest)
  listIncoming(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuerySupportRequestsDto,
  ) {
    return this.supportRequestsService.listIncomingRequests(user, query);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  @ResponseMessage('Support request reviewed successfully')
  @ApiOperation({
    summary:
      "Approve or reject a support request for the caller's own organization",
  })
  @ApiOkResponse({ type: SupportRequest })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'Support request does not exist' })
  @ApiConflictResponse({
    description:
      'Already reviewed, or the requester is already assigned to an organization',
  })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: ReviewSupportRequestDto,
  ): Promise<SupportRequest> {
    return this.supportRequestsService.reviewRequest(id, dto, user);
  }

  @Roles(UserRole.OWNER)
  @Get('active')
  @ResponseMessage('Active support users fetched successfully')
  @ApiOperation({
    summary:
      "The caller's current team: every approved (active) support user for their own organization",
  })
  @ApiPaginatedResponse(SupportRequest)
  listActive(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuerySupportRequestsDto,
  ) {
    return this.supportRequestsService.listActiveMembers(user, query);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id/revoke')
  @ResponseMessage('Support access revoked successfully')
  @ApiOperation({
    summary: "Revoke a support user's access to the caller's own organization",
  })
  @ApiOkResponse({ type: SupportRequest })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'Support request does not exist' })
  @ApiConflictResponse({
    description: "This support user's access is not currently active",
  })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<SupportRequest> {
    return this.supportRequestsService.revokeAccess(id, user);
  }
}
