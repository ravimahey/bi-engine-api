import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

/**
 * Every table inherits these columns: uuid primary key, audit timestamps,
 * soft-delete support and an optimistic-locking version.
 * Extend it instead of redeclaring the same five columns per entity.
 */
export abstract class BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  /** Set by `repository.softDelete()`; rows with a value are filtered out of finds. */
  @Exclude()
  @DeleteDateColumn({
    type: 'timestamptz',
    name: 'deleted_at',
    nullable: true,
    select: false,
  })
  deletedAt: Date | null;

  /** Optimistic locking counter — internal, never serialized to clients. */
  @Exclude()
  @VersionColumn({ default: 1 })
  version: number;
}
