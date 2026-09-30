import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { paginate } from '@common/utils';
import type { ListImportsQueryDto } from '../dto';
import { DataImport } from '../entities';
import { ImportContextService } from './import-context.service';

/** Backs the import history list — newest first, without the (large) issue lists. */
@Injectable()
export class ImportHistoryService {
  constructor(
    @InjectRepository(DataImport)
    private readonly imports: Repository<DataImport>,
    private readonly contextService: ImportContextService,
  ) {}

  async list(query: ListImportsQueryDto, user: AuthenticatedUser) {
    this.contextService.assertAccess(query.organizationId, user);
    const result = await this.imports.findAndCount({
      where: {
        organizationId: query.organizationId,
        ...(query.importType ? { importType: query.importType } : {}),
      },
      select: {
        id: true,
        importType: true,
        status: true,
        fileName: true,
        totalRows: true,
        errorCount: true,
        warningCount: true,
        summary: true,
        createdAt: true,
        committedAt: true,
      },
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginate(result, query.page, query.limit);
  }
}
