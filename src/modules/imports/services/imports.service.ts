import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import {
  getImportDefinition,
  IMPORT_VALIDATION_TTL_MS,
  MAX_RETURNED_ISSUES,
  MAX_STORED_ISSUES,
} from '../constants';
import { DataImport, ImportStatus, ImportType } from '../entities';
import type {
  ImportIssue,
  ImportValidation,
  ImportValidationResult,
} from '../types';
import { matchHeaders, readRows, sortIssues } from '../utils';
import { ImportContextService } from './import-context.service';
import {
  ImportFileError,
  ImportFileParserService,
} from './import-file-parser.service';
import { ImportRegistryService } from './import-registry.service';

/**
 * Two-step import: `validate` parses and checks the whole file and stores
 * the normalized records without touching business data; `commit` writes
 * exactly those records in ONE database transaction — every row lands or
 * none do, so a failure halfway can never leave half an import behind.
 * Any error blocks commit; warnings are shown and the user decides.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    @InjectRepository(DataImport)
    private readonly imports: Repository<DataImport>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly parser: ImportFileParserService,
    private readonly registry: ImportRegistryService,
    private readonly contextService: ImportContextService,
  ) {}

  async validate(
    file: { originalname: string; buffer: Buffer; size: number },
    organizationId: string,
    importType: ImportType,
    user: AuthenticatedUser,
  ): Promise<ImportValidationResult> {
    this.contextService.assertAccess(organizationId, user);
    const definition = getImportDefinition(importType);
    const context = await this.contextService.resolve(organizationId);
    // Multer decodes multipart file names as latin1; restore UTF-8 names like "Café.xlsx".
    const fileName = Buffer.from(file.originalname, 'latin1')
      .toString('utf8')
      .slice(0, 255);

    const issues: ImportIssue[] = [];
    let totalRows = 0;
    let validation: ImportValidation<unknown> | null = null;
    try {
      const sheet = await this.parser.parse(fileName, file.buffer);
      totalRows = sheet.rows.length;
      issues.push(
        ...sheet.warnings.map((message) => ({
          severity: 'warning' as const,
          row: null,
          column: null,
          message,
        })),
      );

      const headers = matchHeaders(sheet.headers, definition.columns);
      issues.push(...headers.issues);
      if (!headers.issues.some((issue) => issue.severity === 'error')) {
        const read = readRows(sheet, definition.columns, headers.columnIndex);
        issues.push(...read.issues);
        validation = await this.registry
          .handlerFor(importType)
          .validate(read.rows, context);
        issues.push(...validation.issues);
        issues.push(
          ...(await this.contextService.overlapWarnings(
            organizationId,
            importType,
          )),
        );
      }
    } catch (error) {
      if (!(error instanceof ImportFileError)) throw error;
      issues.push({
        severity: 'error',
        row: null,
        column: null,
        message: error.message,
      });
    }

    if (
      validation &&
      validation.records.length === 0 &&
      !issues.some((i) => i.severity === 'error')
    ) {
      issues.push({
        severity: 'error',
        row: null,
        column: null,
        message: 'No importable rows were found in the file.',
      });
    }
    const sorted = sortIssues(issues);
    const errorCount = sorted.filter((i) => i.severity === 'error').length;
    const status =
      errorCount > 0 ? ImportStatus.FAILED : ImportStatus.VALIDATED;

    const saved = await this.imports.save(
      this.imports.create({
        organizationId,
        createdById: user.id,
        importType,
        status,
        fileName,
        fileSize: file.size,
        totalRows,
        errorCount,
        warningCount: sorted.length - errorCount,
        issues: sorted.slice(0, MAX_STORED_ISSUES),
        summary: validation?.summary ?? null,
        payload:
          status === ImportStatus.VALIDATED
            ? (validation?.records ?? null)
            : null,
      }),
    );
    return this.toResult(
      saved,
      status === ImportStatus.VALIDATED ? (validation?.preview ?? []) : [],
    );
  }

  async commit(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ImportValidationResult> {
    try {
      const committed = await this.dataSource.transaction(async (manager) => {
        const record = await manager
          .getRepository(DataImport)
          .createQueryBuilder('import')
          .addSelect('import.payload')
          .where('import.id = :id', { id })
          .setLock('pessimistic_write')
          .getOne();
        if (!record) throw new NotFoundException('Import not found.');
        this.contextService.assertAccess(record.organizationId, user);
        this.assertCommittable(record);

        const context = await this.contextService.resolve(
          record.organizationId,
        );
        await this.registry
          .handlerFor(record.importType)
          .commit(record.payload ?? [], context, manager);

        record.status = ImportStatus.COMMITTED;
        record.committedAt = new Date();
        record.payload = null;
        return manager.save(record);
      });
      return this.toResult(committed, []);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        this.logger.error(
          `Import ${id} commit failed: ${error.message}`,
          error.stack,
        );
        throw new UnprocessableEntityException(
          'The import could not be saved and nothing was changed. Upload the file again; if it keeps failing, contact support.',
        );
      }
      throw error;
    }
  }

  async discard(id: string, user: AuthenticatedUser): Promise<void> {
    const record = await this.findOwned(id, user);
    if (record.status !== ImportStatus.VALIDATED) {
      throw new ConflictException(`This import is already ${record.status}.`);
    }
    await this.imports.update(id, {
      status: ImportStatus.DISCARDED,
      payload: null,
    });
  }

  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ImportValidationResult> {
    return this.toResult(await this.findOwned(id, user), []);
  }

  private async findOwned(
    id: string,
    user: AuthenticatedUser,
  ): Promise<DataImport> {
    const record = await this.imports.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Import not found.');
    this.contextService.assertAccess(record.organizationId, user);
    return record;
  }

  private assertCommittable(record: DataImport): void {
    switch (record.status) {
      case ImportStatus.COMMITTED:
        throw new ConflictException('This file has already been imported.');
      case ImportStatus.DISCARDED:
        throw new ConflictException(
          'This import was cancelled. Upload the file again.',
        );
      case ImportStatus.FAILED:
        throw new UnprocessableEntityException(
          'This file has errors. Fix them and upload it again.',
        );
    }
    if (Date.now() - record.createdAt.getTime() > IMPORT_VALIDATION_TTL_MS) {
      throw new ConflictException(
        'This validation has expired. Upload the file again to re-check it.',
      );
    }
  }

  private toResult(
    record: DataImport,
    preview: Array<Record<string, string>>,
  ): ImportValidationResult {
    return {
      id: record.id,
      importType: record.importType,
      status: record.status,
      fileName: record.fileName,
      totalRows: record.totalRows,
      errorCount: record.errorCount,
      warningCount: record.warningCount,
      issues: record.issues.slice(0, MAX_RETURNED_ISSUES),
      summary: record.summary,
      preview,
      expiresAt:
        record.status === ImportStatus.VALIDATED
          ? new Date(
              record.createdAt.getTime() + IMPORT_VALIDATION_TTL_MS,
            ).toISOString()
          : null,
      createdAt: record.createdAt.toISOString(),
      committedAt: record.committedAt?.toISOString() ?? null,
    };
  }
}
