import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `sync_cursors` (`modules/providers`) — per-connection, per-entity-type
 * incremental-sync checkpoint. Provider-agnostic: `entity_type` is whatever
 * string a provider module's polling layer uses ("Vendor", "Bill", ...) and
 * `cursor` is opaque (an ISO timestamp today, an opaque page token for a
 * future provider tomorrow).
 */
export class AddSyncCursors1789276065002 implements MigrationInterface {
  name = 'AddSyncCursors1789276065002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sync_cursors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "provider_connection_id" uuid NOT NULL, "entity_type" character varying(100) NOT NULL, "cursor" character varying(255) NOT NULL, "last_synced_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_277cc4d9ecfc95b9d4353908501" PRIMARY KEY ("id"))`,
    );
    // Query shape: "the checkpoint for this connection's Bill/Vendor/... sync" — also the row's natural identity.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_sync_cursors_connection_entity" ON "sync_cursors" ("provider_connection_id", "entity_type")`,
    );
    await queryRunner.query(
      `ALTER TABLE "sync_cursors" ADD CONSTRAINT "FK_f0a9bc637757a7e29822851d844" FOREIGN KEY ("provider_connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sync_cursors" DROP CONSTRAINT "FK_f0a9bc637757a7e29822851d844"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_sync_cursors_connection_entity"`,
    );
    await queryRunner.query(`DROP TABLE "sync_cursors"`);
  }
}
