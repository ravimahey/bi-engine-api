import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Links a user to the organization they create/join
 * (`OrganizationsService.create`, `UsersService.linkOrganization`). Nullable
 * — a user can exist before they have an organization — and `ON DELETE SET
 * NULL` rather than `CASCADE`: deactivating/deleting an organization must
 * never take a user account down with it.
 */
export class AddUserOrganizationLink1789403712128 implements MigrationInterface {
  name = 'AddUserOrganizationLink1789403712128';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "organization_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "idx_users_organization_id" ON "users"  ("organization_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_21a659804ed7bf61eb91688dea7" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_21a659804ed7bf61eb91688dea7"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_users_organization_id"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "organization_id"`,
    );
  }
}
