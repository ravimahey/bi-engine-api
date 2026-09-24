import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '@modules/organizations/entities';
import { UsersModule } from '@modules/users/users.module';
import { SupportRequest } from './entities';
import { SupportOrganizationsController } from './support-organizations.controller';
import { SupportRequestsController } from './support-requests.controller';
import {
  SupportOrganizationsService,
  SupportRequestsService,
} from './services';

/**
 * Support role signup + owner-approval flow. Owns `support_requests`;
 * reads `Organization` directly (same cross-module pattern `AdminModule`
 * uses) rather than through `OrganizationsModule`, since the read shapes
 * and visibility rules here (any active org, not "your own") differ from
 * that module's. Reuses `UsersService.linkOrganization` from `UsersModule`
 * to assign an approved request's organization — the same mechanism
 * buyer/supplier self-serve org creation already uses.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SupportRequest, Organization]),
    UsersModule,
  ],
  controllers: [SupportOrganizationsController, SupportRequestsController],
  providers: [SupportOrganizationsService, SupportRequestsService],
})
export class SupportModule {}
