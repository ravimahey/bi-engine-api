import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `user_walkthroughs` (`modules/walkthroughs`) — each user's progress through
 * the frontend's guided tours. The composite unique index doubles as the
 * index for "all of this user's tours" (leftmost-prefix on `user_id`), so
 * the FK column needs no separate index.
 */
export class AddUserWalkthroughs1789600000000 implements MigrationInterface {
  name = 'AddUserWalkthroughs1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_walkthroughs_status_enum" AS ENUM('in_progress', 'completed', 'skipped')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_walkthroughs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "user_id" uuid NOT NULL, "tour_key" character varying(100) NOT NULL, "status" "public"."user_walkthroughs_status_enum" NOT NULL DEFAULT 'in_progress', "current_step" integer NOT NULL DEFAULT '0', "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_user_walkthroughs_id" PRIMARY KEY ("id"))`,
    );
    // Query shapes: "this user's tours" (list) and the (user, tour) upsert.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_user_walkthroughs_user_tour" ON "user_walkthroughs" ("user_id", "tour_key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_walkthroughs" ADD CONSTRAINT "FK_user_walkthroughs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_walkthroughs" DROP CONSTRAINT "FK_user_walkthroughs_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_user_walkthroughs_user_tour"`,
    );
    await queryRunner.query(`DROP TABLE "user_walkthroughs"`);
    await queryRunner.query(
      `DROP TYPE "public"."user_walkthroughs_status_enum"`,
    );
  }
}
