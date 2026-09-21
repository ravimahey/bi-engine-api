import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage, Roles } from '@common/decorators';
import { UserRole } from '@modules/users/entities';
import { AdminDashboardOverviewDto, AdminDashboardQueryDto } from './dto';
import { AdminDashboardService } from './services';

/**
 * Platform-wide dashboard for the admin role: an admin belongs to no
 * organization, so `/dashboard/*` (one tenant's spend/revenue) can never
 * load data for them — this is the admin-scoped equivalent instead.
 */
@ApiTags('Admin - Dashboard')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@ApiForbiddenResponse({ description: 'Admin role required' })
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly adminDashboard: AdminDashboardService) {}

  @Get('overview')
  @ResponseMessage('Admin dashboard overview fetched successfully')
  @ApiOperation({
    summary:
      'Platform-wide KPIs: organization/user counts, provider connection health, and organization/user growth trends',
  })
  @ApiOkResponse({ type: AdminDashboardOverviewDto })
  getOverview(
    @Query() query: AdminDashboardQueryDto,
  ): Promise<AdminDashboardOverviewDto> {
    return this.adminDashboard.getOverview(query);
  }
}
