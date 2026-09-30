import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { SourceSystem, TaxRate } from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import { IMPORT_PREVIEW_ROWS } from '../constants';
import type {
  ImportContext,
  ImportHandler,
  ImportIssue,
  ImportValidation,
  ReadRow,
  TaxRateRecord,
} from '../types';
import {
  cell,
  flag,
  flagDuplicateNames,
  summarize,
  taxRateKey,
  text,
} from '../utils';
import { ImportLookupService } from './import-lookup.service';

/** Step 5 — Tax Rates file → canonical `TaxRate` rows (source CSV). */
@Injectable()
export class TaxRatesImportService implements ImportHandler<TaxRateRecord> {
  constructor(
    private readonly lookup: ImportLookupService,
    private readonly bulk: RecordsBulkService,
  ) {}

  async validate(
    rows: ReadRow[],
    context: ImportContext,
  ): Promise<ImportValidation<TaxRateRecord>> {
    const issues: ImportIssue[] = [];
    flagDuplicateNames(rows, 'Tax Rate Name', issues);

    // `Rate %` is required per row, so the reader already flagged blanks.
    const records: TaxRateRecord[] = rows
      .filter((row) => text(row, 'name') && text(row, 'ratePercent') !== null)
      .map((row) => {
        const name = text(row, 'name') as string;
        return {
          key: taxRateKey(name),
          name,
          ratePercent: text(row, 'ratePercent') as string,
          isActive: flag(row, 'active') ?? true,
        };
      });

    const keys = records.map((r) => r.key);
    const existing = await this.lookup.existing(
      TaxRate,
      context.organizationId,
      keys,
    );
    return {
      records,
      issues,
      summary: summarize(keys, existing),
      preview: records.slice(0, IMPORT_PREVIEW_ROWS).map((r) => ({
        'Tax Rate Name': r.name,
        'Rate %': `${Number(r.ratePercent)}%`,
        Active: cell(r.isActive),
        Action: existing.has(r.key) ? 'Update' : 'Create',
      })),
    };
  }

  async commit(
    records: TaxRateRecord[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<void> {
    await this.bulk.upsertProvenanced(
      manager,
      TaxRate,
      records.map((r) => ({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: r.key,
        sourceConnectionId: null,
        name: r.name,
        ratePercent: r.ratePercent,
        isActive: r.isActive,
      })),
    );
  }
}
