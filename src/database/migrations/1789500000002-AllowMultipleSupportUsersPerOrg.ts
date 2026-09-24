import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lifts "at most one active support user per organization" — an
 * organization can now have several approved support users (employees) at
 * once. Also adds the `revoked` status an approved request moves to when
 * its owner pulls that employee's access (see
 * `SupportRequestsService.revokeAccess`).
 */
export class AllowMultipleSupportUsersPerOrg1789500000002 implements MigrationInterface {
  name = 'AllowMultipleSupportUsersPerOrg1789500000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_support_requests_org_active"`,
    );
    // Safe inside this migration's own transaction, same as `AddSupportRole`
    // — Postgres only forbids *using* a freshly added enum value in the same
    // transaction that added it, and this migration only adds the value.
    await queryRunner.query(
      `ALTER TYPE "public"."support_requests_status_enum" ADD VALUE 'revoked'`,
    );
  }

  /**
   * Symmetric with `AddSupportRole`'s `down()`: Postgres has no `DROP VALUE`
   * for enums, so removing `revoked` means swapping in a fresh type built
   * from the remaining values — the `USING` cast fails loudly if any row
   * still has `status = 'revoked'`. Recreating the unique index fails
   * loudly too, if by then two approved rows share an organization.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."support_requests_status_enum" RENAME TO "support_requests_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."support_requests_status_enum" AS ENUM('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ALTER COLUMN "status" TYPE "public"."support_requests_status_enum" USING "status"::text::"public"."support_requests_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."support_requests_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_support_requests_org_active" ON "support_requests" ("organization_id") WHERE "status" = 'approved'`,
    );
  }
}
