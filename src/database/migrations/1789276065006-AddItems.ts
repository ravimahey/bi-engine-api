import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `items` (`modules/records`) — canonical product/service master data,
 * Step 3 of the QuickBooks API Build Order. Turns a vague category into a
 * specific, trackable thing ("flour", not just "Materials").
 */
export class AddItems1789276065006 implements MigrationInterface {
  name = 'AddItems1789276065006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."items_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."items_item_type_enum" AS ENUM('inventory', 'non_inventory', 'service')`,
    );
    await queryRunner.query(
      `CREATE TABLE "items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."items_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "name" character varying(255) NOT NULL, "description" text, "item_type" "public"."items_item_type_enum" NOT NULL, "unit_price" numeric(14,4), "currency" character(3) NOT NULL DEFAULT 'USD', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_ba5885359424c15ca6b9e79bcf6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_97cd261a539f2103953dff5277" ON "items" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_72a85ad995d4c4667bd738e480" ON "items" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9a509df9866088b38683d35f73" ON "items" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "items" ADD CONSTRAINT "FK_97cd261a539f2103953dff5277d" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "items" ADD CONSTRAINT "FK_72a85ad995d4c4667bd738e480b" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "items" DROP CONSTRAINT "FK_72a85ad995d4c4667bd738e480b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "items" DROP CONSTRAINT "FK_97cd261a539f2103953dff5277d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9a509df9866088b38683d35f73"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_72a85ad995d4c4667bd738e480"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97cd261a539f2103953dff5277"`,
    );
    await queryRunner.query(`DROP TABLE "items"`);
    await queryRunner.query(`DROP TYPE "public"."items_item_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."items_source_system_enum"`);
  }
}
