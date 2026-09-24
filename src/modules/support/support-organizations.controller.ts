import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  ResponseMessage,
  Roles,
} from '@common/decorators';
import { UserRole } from '@modules/users/entities';
import {
  OrganizationForSupportResponseDto,
  QueryOrganizationsForSupportDto,
} from './dto';
import { SupportOrganizationsService } from './services';

/**
 * Step in the support signup flow: browse/search organizations to pick one
 * to request access to (see `SupportRequestsController` for the request
 * itself).
 */
@ApiTags('Support')
@ApiBearerAuth('access-token')
@Roles(UserRole.SUPPORT)
@Controller('support/organizations')
export class SupportOrganizationsController {
  constructor(
    private readonly supportOrganizationsService: SupportOrganizationsService,
  ) {}

  @Get()
  @ResponseMessage('Organizations fetched successfully')
  @ApiOperation({
    summary:
      'List active organizations, filterable by organization name and owner name — for picking one to request support access to',
  })
  @ApiPaginatedResponse(OrganizationForSupportResponseDto)
  findAll(@Query() query: QueryOrganizationsForSupportDto) {
    return this.supportOrganizationsService.listOrganizations(query);
  }
}
