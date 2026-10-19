import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import type { Response } from 'express';
import {
  ApiPaginatedResponse,
  CurrentUser,
  type AuthenticatedUser,
  Roles,
  ResponseMessage,
} from '@common/decorators';
import { IdParamDto } from '@common/dto';
import { getAppConfig, setAuthCookies } from '@common/utils';
import { UserRole } from '@modules/users/entities';
import {
  CreateOrganizationDto,
  QueryOrganizationsDto,
  UpdateOrganizationDto,
} from './dto';
import { Organization } from './entities';
import { OrganizationsService } from './services';

/**
 * Tenant management. Creating/reading/updating an organization is available
 * to any signed-in user, scoped to their own organization — admins can act
 * on any organization; an owner/support user only their own (enforced in
 * `OrganizationsService`, not here — see `assertOwnOrganization`). Creating
 * one is owner/admin only — support never self-serves an organization, it
 * is approved into one. Listing every organization and deleting/restoring
 * one stay admin-only.
 */
@ApiTags('Organizations')
@ApiBearerAuth('access-token')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly configService: ConfigService,
  ) {}

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiForbiddenResponse({ description: 'Owner or admin role required' })
  @Post()
  @ResponseMessage('Organization created successfully')
  @ApiOperation({
    summary:
      'Create an organization — self-serve for the caller (who is linked to it and gets a refreshed session), or standalone when called by an admin',
  })
  @ApiCreatedResponse({ type: Organization })
  @ApiConflictResponse({
    description:
      'Slug already in use, or the caller already belongs to an organization',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createOrganizationDto: CreateOrganizationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Organization> {
    const { organization, tokens } = await this.organizationsService.create(
      createOrganizationDto,
      user,
    );

    if (tokens) {
      setAuthCookies(res, getAppConfig(this.configService), tokens);
    }

    return organization;
  }

  @Get('my-organizations')
  @ResponseMessage('User organizations fetched successfully')
  @ApiOperation({
    summary: 'List all organizations the authenticated user belongs to',
  })
  @ApiOkResponse({ type: Organization, isArray: true })
  getMyOrganizations(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.getUserOrganizations(user.id);
  }

  @Roles(UserRole.ADMIN)
  @ApiForbiddenResponse({ description: 'Admin role required' })
  @Get()
  @ResponseMessage('Organizations fetched successfully')
  @ApiOperation({
    summary: 'List organizations with pagination, search and filters',
  })
  @ApiPaginatedResponse(Organization)
  findAll(@Query() query: QueryOrganizationsDto) {
    return this.organizationsService.findAll(query);
  }

  @Get(':id')
  @ResponseMessage('Organization fetched successfully')
  @ApiOperation({
    summary: 'Get a single organization (must be your own, unless admin)',
  })
  @ApiOkResponse({ type: Organization })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiNotFoundResponse({ description: 'Organization does not exist' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<Organization> {
    return this.organizationsService.findOne(id, user);
  }

  @Patch(':id')
  @ResponseMessage('Organization updated successfully')
  @ApiOperation({
    summary: 'Update an organization (must be your own, unless admin)',
  })
  @ApiOkResponse({ type: Organization })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ): Promise<Organization> {
    return this.organizationsService.update(id, updateOrganizationDto, user);
  }

  @Roles(UserRole.ADMIN)
  @ApiForbiddenResponse({ description: 'Admin role required' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an organization' })
  remove(@Param() { id }: IdParamDto): Promise<void> {
    return this.organizationsService.remove(id);
  }

  @Roles(UserRole.ADMIN)
  @ApiForbiddenResponse({ description: 'Admin role required' })
  @Patch(':id/restore')
  @ResponseMessage('Organization restored successfully')
  @ApiOperation({ summary: 'Restore a soft-deleted organization' })
  @ApiOkResponse({ type: Organization })
  restore(@Param() { id }: IdParamDto): Promise<Organization> {
    return this.organizationsService.restore(id);
  }
}
