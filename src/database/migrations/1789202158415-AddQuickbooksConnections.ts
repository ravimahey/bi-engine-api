import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuickbooksConnections1789202158415 implements MigrationInterface {
  name = 'AddQuickbooksConnections1789202158415';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "quickbooks_connections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "realm_id" character varying(100) NOT NULL, "access_token" text NOT NULL, "refresh_token" text NOT NULL, "access_token_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "refresh_token_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_quickbooks_connections_realm_id" UNIQUE ("realm_id"), CONSTRAINT "PK_quickbooks_connections_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_quickbooks_connections_realm_id" ON "quickbooks_connections" ("realm_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_quickbooks_connections_realm_id"`,
    );
    await queryRunner.query(`DROP TABLE "quickbooks_connections"`);
  }
}
