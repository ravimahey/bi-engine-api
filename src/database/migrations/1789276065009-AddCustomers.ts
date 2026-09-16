import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `customers` (`modules/records`) — canonical customer master data, Step 11
 * of the QuickBooks API Build Order (revenue side, the mirror of `vendors`).
 * Every Invoice/SalesReceipt/Payment references this.
 */
export class AddCustomers1789276065009 implements MigrationInterface {
  name = 'AddCustomers1789276065009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."customers_source_system_enum" AS ENUM('quickbooks', 'xero', 'zoho', 'manual', 'csv')`,
    );
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "organization_id" uuid NOT NULL, "source_system" "public"."customers_source_system_enum" NOT NULL, "source_external_id" character varying(100) NOT NULL, "source_connection_id" uuid, "display_name" character varying(255) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "balance" numeric(14,2), "email" character varying(255), "phone" character varying(50), CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d2fc0e42b07d01fafc3fbb2bee" ON "customers" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7632509c9b74ee44cc20ce49bc" ON "customers" ("source_connection_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5eb27afc1efb2b5d22e5bb7dd0" ON "customers" ("organization_id", "source_system", "source_external_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_d2fc0e42b07d01fafc3fbb2bee3" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_7632509c9b74ee44cc20ce49bcc" FOREIGN KEY ("source_connection_id") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_7632509c9b74ee44cc20ce49bcc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_d2fc0e42b07d01fafc3fbb2bee3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5eb27afc1efb2b5d22e5bb7dd0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7632509c9b74ee44cc20ce49bc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d2fc0e42b07d01fafc3fbb2bee"`,
    );
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(
      `DROP TYPE "public"."customers_source_system_enum"`,
    );
  }
}
