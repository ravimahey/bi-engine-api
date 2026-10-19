import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignalMetadata1792405207523 implements MigrationInterface {
  name = 'AddSignalMetadata1792405207523';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "metadata" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "signals" DROP COLUMN IF EXISTS "metadata"`,
    );
  }
}
