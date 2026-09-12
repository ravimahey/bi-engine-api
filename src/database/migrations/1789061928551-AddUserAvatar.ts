import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAvatar1789061928551 implements MigrationInterface {
  name = 'AddUserAvatar1789061928551';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "avatar_url" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "avatar_public_id" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "avatar_public_id"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
  }
}
