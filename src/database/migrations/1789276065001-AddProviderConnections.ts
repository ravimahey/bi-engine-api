import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `provider_connections` (`modules/providers`) — one row per organization+
 * provider, encrypted OAuth tokens. Every provider module (QuickBooks today,
 * Xero/Zoho later) FKs its own/canonical tables to this, never the reverse.
 * One entity per migration file: `sync_cursors` (which FKs to this table)
 * gets its own file, `AddSyncCursors`, run right after this one.
 */
export class AddProviderConnections1789276065001 implements MigrationInterface {
  name = 'AddProviderConnections1789276065001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."provider_connections_provider_enum" AS ENUM('quickbooks', 'xero', 'zoho')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."provider_connections_status_enum" AS ENUM('pending', 'connected', 'error', 'disconnected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "provider_connections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "provider" "public"."provider_connections_provider_enum" NOT NULL, "external_realm_id" character varying(100) NOT NULL, "status" "public"."provider_connections_status_enum" NOT NULL DEFAULT 'pending', "access_token" text, "refresh_token" text, "access_token_expires_at" TIMESTAMP WITH TIME ZONE, "refresh_token_expires_at" TIMESTAMP WITH TIME ZONE, "last_error" text, "connected_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e214ce18aa55a4cf2518dc88293" PRIMARY KEY ("id"))`,
    );
    // Query shape: "every connection for this org" (settings/integrations page).
    await queryRunner.query(
      `CREATE INDEX "idx_provider_connections_organization_id" ON "provider_connections" ("organization_id")`,
    );
    // Query shape: "the org's connection for this provider" — also enforces one row per (organization, provider).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_provider_connections_org_provider" ON "provider_connections" ("organization_id", "provider")`,
    );
    await queryRunner.query(
      `ALTER TABLE "provider_connections" ADD CONSTRAINT "FK_aa02a5e66139b7cd0df4c8cf95c" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "provider_connections" DROP CONSTRAINT "FK_aa02a5e66139b7cd0df4c8cf95c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_provider_connections_org_provider"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_provider_connections_organization_id"`,
    );
    await queryRunner.query(`DROP TABLE "provider_connections"`);
    await queryRunner.query(
      `DROP TYPE "public"."provider_connections_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."provider_connections_provider_enum"`,
    );
  }
}
