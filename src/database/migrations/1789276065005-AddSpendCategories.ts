import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `spend_categories` (`modules/records`) — canonical chart-of-accounts
 * category buckets, Step 2 of the QuickBooks API Build Order. Self-FK'd for
 * parent/child category hierarchies.
 */
export class AddSpendCategories1789276065005 implements MigrationInterface {
  name = 'AddSpendCategories1789276065005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."spend_categories_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TABLE "spend_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."spend_categories_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "name" character varying(255) NOT NULL, "fully_qualified_name" character varying(500), "category_type" character varying(100), "parent_category_id" uuid, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_3735093434b7fbe060153f8ca31" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb682d12a5b755b020aba8ecb6" ON "spend_categories" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a968b1ce6163eddf8ee5295fd3" ON "spend_categories" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_66dfacef8be0d99b2b11f68247" ON "spend_categories" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7ed5b7bc120d64ca6842c22ce5" ON "spend_categories" ("parent_category_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "spend_categories" ADD CONSTRAINT "FK_bb682d12a5b755b020aba8ecb6a" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "spend_categories" ADD CONSTRAINT "FK_a968b1ce6163eddf8ee5295fd3e" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "spend_categories" ADD CONSTRAINT "FK_7ed5b7bc120d64ca6842c22ce5d" FOREIGN KEY ("parent_category_id") REFERENCES "spend_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "spend_categories" DROP CONSTRAINT "FK_7ed5b7bc120d64ca6842c22ce5d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "spend_categories" DROP CONSTRAINT "FK_a968b1ce6163eddf8ee5295fd3e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "spend_categories" DROP CONSTRAINT "FK_bb682d12a5b755b020aba8ecb6a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7ed5b7bc120d64ca6842c22ce5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_66dfacef8be0d99b2b11f68247"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a968b1ce6163eddf8ee5295fd3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bb682d12a5b755b020aba8ecb6"`,
    );
    await queryRunner.query(`DROP TABLE "spend_categories"`);
    await queryRunner.query(
      `DROP TYPE "public"."spend_categories_source_system_enum"`,
    );
  }
}
