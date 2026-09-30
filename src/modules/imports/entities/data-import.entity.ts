import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/entities';
import { Organization } from '@modules/organizations/entities';
import { User } from '@modules/users/entities';
import type { ImportIssue, ImportSummary } from '../types';
import { ImportStatus, ImportType } from './import-enums';

/**
 * One uploaded CSV/Excel file and what became of it. Validation and commit
 * are two separate requests: validation stores the normalized rows in
 * `payload` so the user can review a preview first, and commit writes
 * exactly what was reviewed (no re-upload, no re-parse). `payload` is
 * cleared once committed or discarded, so the table stays small.
 */
@Entity({ name: 'data_imports' })
@Index('idx_data_imports_org_created', ['organizationId', 'createdAt'])
export class DataImport extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ApiProperty({ format: 'uuid', nullable: true })
  @Index('idx_data_imports_created_by')
  @Column({ type: 'uuid', name: 'created_by_id', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @ApiProperty({ enum: ImportType })
  @Column({ type: 'enum', enum: ImportType, name: 'import_type' })
  importType: ImportType;

  @ApiProperty({ enum: ImportStatus })
  @Column({ type: 'enum', enum: ImportStatus })
  status: ImportStatus;

  @ApiProperty({ example: 'vendors.xlsx' })
  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName: string;

  @ApiProperty()
  @Column({ type: 'int', name: 'file_size' })
  fileSize: number;

  @ApiProperty({ description: 'Data rows in the file (blank rows excluded)' })
  @Column({ type: 'int', name: 'total_rows' })
  totalRows: number;

  @ApiProperty()
  @Column({ type: 'int', name: 'error_count' })
  errorCount: number;

  @ApiProperty()
  @Column({ type: 'int', name: 'warning_count' })
  warningCount: number;

  /** Capped list — `errorCount`/`warningCount` hold the true totals. */
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @Column({ type: 'jsonb', default: () => "'[]'" })
  issues: ImportIssue[];

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ type: 'jsonb', nullable: true })
  summary: ImportSummary | null;

  /** Normalized records awaiting commit — internal, never sent to clients. */
  @Exclude()
  @Column({ type: 'jsonb', nullable: true, select: false })
  payload: unknown[] | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'committed_at', nullable: true })
  committedAt: Date | null;
}
