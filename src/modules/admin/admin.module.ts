import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '@modules/organizations/entities';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { ProviderConnection, SyncCursor } from '@modules/providers/entities';
import { User } from '@modules/users/entities';
import { UsersModule } from '@modules/users/users.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminOrganizationsController } from './admin-organizations.controller';
import { AdminUsersController } from './admin-users.controller';
import {
  AdminDashboardService,
  AdminOrganizationOverviewService,
  AdminUserDataService,
  AdminUsersService,
} from './services';

/**
 * Home of every admin-only API. A layer over the feature modules' exported
 * services and entities: it owns no entities of its own, only the `/admin/*`
 * routes, their role gate and admin-specific rules (e.g. admins never see
 * other admin accounts, cross-tenant overviews).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Organization,
      ProviderConnection,
      SyncCursor,
    ]),
    UsersModule,
    OrganizationsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminOrganizationsController,
    AdminDashboardController,
  ],
  providers: [
    AdminUsersService,
    AdminOrganizationOverviewService,
    AdminUserDataService,
    AdminDashboardService,
  ],
})
export class AdminModule {}
