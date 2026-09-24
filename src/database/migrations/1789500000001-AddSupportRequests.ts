import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `support_requests` (`modules/support`) — a support user's request to be
 * granted read-only access to one organization, and the owner's decision on
 * it. The two partial unique indexes are the actual backend/DB enforcement
 * behind "one active support user per org" and "no duplicate pending
 * request" — TypeORM's `@Index` decorator can't express a `WHERE` clause,
 * so both are raw SQL here (same limitation `provider_connections`' plain
 * composite unique index doesn't run into, since this one needs a partial
 * index instead of a full composite one).
 */
export class AddSupportRequests1789500000001 implements MigrationInterface {
  name = 'AddSupportRequests1789500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."support_requests_status_enum" AS ENUM('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "support_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "requester_id" uuid NOT NULL, "organization_id" uuid NOT NULL, "status" "public"."support_requests_status_enum" NOT NULL DEFAULT 'pending', "reviewed_by_id" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_support_requests_id" PRIMARY KEY ("id"))`,
    );

    // Query shape: "this support user's own requests" (their status page).
    await queryRunner.query(
      `CREATE INDEX "idx_support_requests_requester_id" ON "support_requests" ("requester_id")`,
    );
    // Query shape: "requests targeting this org" (the owner's inbox).
    await queryRunner.query(
      `CREATE INDEX "idx_support_requests_organization_id" ON "support_requests" ("organization_id")`,
    );
    // Query shape: filtering an inbox/status list by status.
    await queryRunner.query(
      `CREATE INDEX "idx_support_requests_status" ON "support_requests" ("status")`,
    );
    // Enforces: at most one APPROVED (active) support user per organization,
    // including under concurrent approval — a second concurrent UPDATE to
    // 'approved' for the same org violates this and 409s via the global
    // exception filter.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_support_requests_org_active" ON "support_requests" ("organization_id") WHERE "status" = 'approved'`,
    );
    // Enforces: a support user can't have two PENDING requests for the same org.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_support_requests_requester_org_pending" ON "support_requests" ("requester_id", "organization_id") WHERE "status" = 'pending'`,
    );

    await queryRunner.query(
      `ALTER TABLE "support_requests" ADD CONSTRAINT "FK_support_requests_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ADD CONSTRAINT "FK_support_requests_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" ADD CONSTRAINT "FK_support_requests_reviewed_by" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_requests" DROP CONSTRAINT "FK_support_requests_reviewed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" DROP CONSTRAINT "FK_support_requests_organization"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_requests" DROP CONSTRAINT "FK_support_requests_requester"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_support_requests_requester_org_pending"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_support_requests_org_active"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_support_requests_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_support_requests_organization_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_support_requests_requester_id"`,
    );
    await queryRunner.query(`DROP TABLE "support_requests"`);
    await queryRunner.query(
      `DROP TYPE "public"."support_requests_status_enum"`,
    );
  }
}
