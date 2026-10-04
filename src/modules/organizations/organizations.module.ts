import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { Organization } from './entities';
import { OrganizationsController } from './organizations.controller';
import {
  OrganizationProfileService,
  OrganizationSlugService,
  OrganizationsService,
} from './services';

/**
 * Registers `Organization` with TypeORM so other modules' entities can carry
 * a real `@ManyToOne` relation to it, and exposes CRUD over the tenant
 * record itself (`OrganizationsController`/`OrganizationsService`) — self
 * serve for a signed-in owner creating/reading/updating their own
 * organization, admin-only for listing every organization and for
 * delete/restore. Imports `UsersModule` to link a caller to the org they
 * create and `AuthModule` to re-issue their session with the new
 * `organizationId` claim right after. Exports `OrganizationsService` so
 * sibling modules can look up/validate an `organizationId` without
 * redeclaring a repository for it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Organization]), UsersModule, AuthModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    OrganizationProfileService,
    OrganizationSlugService,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
