import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `signals` (`modules/signals`) — an organization's attention inbox. The
 * partial unique index is the actual enforcement behind "one active signal
 * per (organization, type, source)": `SignalsService.createSignal` inserts
 * with `ON CONFLICT DO NOTHING` against it, so a re-processed event or a
 * race can never produce a second active signal. TypeORM's `@Index` can't
 * express the `WHERE` clause, so it is raw SQL here (same as
 * `support_requests`).
 */
export class AddSignals1789800000000 implements MigrationInterface {
  name = 'AddSignals1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."signals_severity_enum" AS ENUM('info', 'warning', 'urgent')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."signals_source_type_enum" AS ENUM('order', 'finding', 'invoice', 'connection')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."signals_status_enum" AS ENUM('unread', 'read', 'dismissed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."signals_dismissed_by_enum" AS ENUM('user', 'system')`,
    );
    await queryRunner.query(
      `CREATE TABLE "signals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "type" character varying(50) NOT NULL, "severity" "public"."signals_severity_enum" NOT NULL, "title" character varying(200) NOT NULL, "message" text NOT NULL, "source_type" "public"."signals_source_type_enum" NOT NULL, "source_id" uuid NOT NULL, "status" "public"."signals_status_enum" NOT NULL DEFAULT 'unread', "dismissed_by" "public"."signals_dismissed_by_enum", "read_at" TIMESTAMP WITH TIME ZONE, "dismissed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_signals_id" PRIMARY KEY ("id"))`,
    );

    // Query shapes: the feed (org + status filter, newest first) and the
    // unread count. Leftmost-prefix on `organization_id` also covers the FK.
    await queryRunner.query(
      `CREATE INDEX "idx_signals_org_status_created" ON "signals" ("organization_id", "status", "created_at")`,
    );
    // Enforces dedup: at most one ACTIVE signal per (org, type, source). A
    // dismissed signal leaves the index, so the same condition can raise a
    // fresh signal later.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_signals_dedup_active" ON "signals" ("organization_id", "type", "source_type", "source_id") WHERE "status" IN ('unread', 'read')`,
    );

    await queryRunner.query(
      `ALTER TABLE "signals" ADD CONSTRAINT "FK_signals_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "signals" DROP CONSTRAINT "FK_signals_organization"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_signals_dedup_active"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_signals_org_status_created"`,
    );
    await queryRunner.query(`DROP TABLE "signals"`);
    await queryRunner.query(`DROP TYPE "public"."signals_dismissed_by_enum"`);
    await queryRunner.query(`DROP TYPE "public"."signals_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."signals_source_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."signals_severity_enum"`);
  }
}
