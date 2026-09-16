import { MigrationInterface, QueryRunner } from 'typeorm';

/** The tenant table — every provider connection and every canonical spend-analytics record FKs to this. */
export class AddOrganizations1789276065000 implements MigrationInterface {
  name = 'AddOrganizations1789276065000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_963693341bd612aa01ddf3a4b68" UNIQUE ("slug"), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    // Query shape: resolving an org by its slug (e.g. a subdomain/route param).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_organizations_slug" ON "organizations" ("slug")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_organizations_slug"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
  }
}
