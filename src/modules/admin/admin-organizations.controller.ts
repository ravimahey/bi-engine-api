import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  ApiPaginatedResponse,
  CurrentUser,
  ResponseMessage,
  Roles,
  type AuthenticatedUser,
} from '@common/decorators';
import { IdParamDto } from '@common/dto';
import {
  QueryOrganizationsDto,
  UpdateOrganizationDto,
} from '@modules/organizations/dto';
import { Organization } from '@modules/organizations/entities';
import { OrganizationsService } from '@modules/organizations/services';
import { UserRole } from '@modules/users/entities';
import { OrganizationDetailOverviewDto, OrganizationOverviewDto } from './dto';
import { AdminOrganizationOverviewService } from './services';

/**
 * Admin-only organization management: view, edit and soft-delete any tenant.
 * Admins never create organizations (owners create their own, self-serve, via
 * `POST /organizations`) and there is no restore.
 */
@ApiTags('Admin - Organizations')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@ApiForbiddenResponse({ description: 'Admin role required' })
@Controller('admin/organizations')
export class AdminOrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationOverview: AdminOrganizationOverviewService,
  ) {}

  @Get()
  @ResponseMessage('Organizations fetched successfully')
  @ApiOperation({
    summary: 'List organizations with pagination, search and filters',
  })
  @ApiPaginatedResponse(Organization)
  findAll(@Query() query: QueryOrganizationsDto) {
    return this.organizationsService.findAll(query);
  }

  // Declared before `:id` so "overview" is never parsed as an organization id.
  @Get('overview')
  @ResponseMessage('Organization overviews fetched successfully')
  @ApiOperation({
    summary:
      'One row per organization: user count, provider connection status, error count and last-synced time (its most stale entity)',
  })
  @ApiPaginatedResponse(OrganizationOverviewDto)
  findAllOverviews(@Query() query: QueryOrganizationsDto) {
    return this.organizationOverview.findAll(query);
  }

  @Get(':id/overview')
  @ResponseMessage('Organization overview fetched successfully')
  @ApiOperation({
    summary:
      'Overview of a single organization plus its per-entity sync cursors',
  })
  @ApiOkResponse({ type: OrganizationDetailOverviewDto })
  @ApiNotFoundResponse({ description: 'Organization does not exist' })
  findOverview(
    @Param() { id }: IdParamDto,
  ): Promise<OrganizationDetailOverviewDto> {
    return this.organizationOverview.findOne(id);
  }

  @Get(':id')
  @ResponseMessage('Organization fetched successfully')
  @ApiOperation({ summary: 'Get a single organization' })
  @ApiOkResponse({ type: Organization })
  @ApiNotFoundResponse({ description: 'Organization does not exist' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<Organization> {
    return this.organizationsService.findOne(id, user);
  }

  @Patch(':id')
  @ResponseMessage('Organization updated successfully')
  @ApiOperation({ summary: 'Update an organization' })
  @ApiOkResponse({ type: Organization })
  @ApiNotFoundResponse({ description: 'Organization does not exist' })
  @ApiConflictResponse({ description: 'Slug already in use' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ): Promise<Organization> {
    return this.organizationsService.update(id, updateOrganizationDto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an organization' })
  @ApiNotFoundResponse({ description: 'Organization does not exist' })
  remove(@Param() { id }: IdParamDto): Promise<void> {
    return this.organizationsService.remove(id);
  }
}
