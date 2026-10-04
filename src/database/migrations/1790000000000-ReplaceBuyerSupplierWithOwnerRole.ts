import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Collapses the `buyer` and `supplier` roles into a single `owner` role, so
 * `users_role_enum` becomes `admin | owner | support`. Every existing buyer
 * and supplier account becomes an owner; `owner` is the new column default.
 *
 * Postgres can't drop or rename-merge enum values in place, so this swaps
 * in a fresh type and converts each row through `CASE` inside the `USING`
 * cast — one statement, no window where a row holds an invalid value.
 */
export class ReplaceBuyerSupplierWithOwnerRole1790000000000 implements MigrationInterface {
  name = 'ReplaceBuyerSupplierWithOwnerRole1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'owner', 'support')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING (CASE WHEN "role"::text IN ('buyer', 'supplier') THEN 'owner' ELSE "role"::text END)::"public"."users_role_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'owner'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
  }

  /**
   * Lossy by necessity: once merged, nothing records whether an owner was
   * originally a buyer or a supplier, so every owner comes back as `buyer`
   * (the old column default). Restore from a backup if the exact split
   * matters.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'supplier', 'buyer', 'support')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING (CASE WHEN "role"::text = 'owner' THEN 'buyer' ELSE "role"::text END)::"public"."users_role_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'buyer'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
  }
}
