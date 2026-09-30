import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Item, ItemType, SourceSystem } from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import { IMPORT_PREVIEW_ROWS } from '../constants';
import type {
  ImportContext,
  ImportHandler,
  ImportIssue,
  ImportValidation,
  ItemRecord,
  ReadRow,
} from '../types';
import {
  cell,
  flag,
  flagDuplicateNames,
  itemKey,
  summarize,
  text,
} from '../utils';
import { ImportLookupService } from './import-lookup.service';

/** Step 4 — Items file → canonical `Item` rows (source CSV). */
@Injectable()
export class ItemsImportService implements ImportHandler<ItemRecord> {
  constructor(
    private readonly lookup: ImportLookupService,
    private readonly bulk: RecordsBulkService,
  ) {}

  async validate(
    rows: ReadRow[],
    context: ImportContext,
  ): Promise<ImportValidation<ItemRecord>> {
    const issues: ImportIssue[] = [];
    flagDuplicateNames(rows, 'Item Name', issues);

    const records: ItemRecord[] = rows
      .filter((row) => text(row, 'name'))
      .map((row) => {
        const name = text(row, 'name') as string;
        return {
          key: itemKey(name),
          name,
          itemType: text(row, 'itemType') ?? ItemType.SERVICE,
          description: text(row, 'description'),
          unitPrice: text(row, 'unitPrice'),
          currency: text(row, 'currency') ?? context.defaultCurrency,
          isActive: flag(row, 'active') ?? true,
        };
      });

    const keys = records.map((r) => r.key);
    const existing = await this.lookup.existing(
      Item,
      context.organizationId,
      keys,
    );
    return {
      records,
      issues,
      summary: summarize(keys, existing),
      preview: records.slice(0, IMPORT_PREVIEW_ROWS).map((r) => ({
        'Item Name': r.name,
        Type: r.itemType,
        'Unit Price': cell(r.unitPrice),
        Currency: r.currency,
        Active: cell(r.isActive),
        Action: existing.has(r.key) ? 'Update' : 'Create',
      })),
    };
  }

  async commit(
    records: ItemRecord[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<void> {
    await this.bulk.upsertProvenanced(
      manager,
      Item,
      records.map((r) => ({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: r.key,
        sourceConnectionId: null,
        name: r.name,
        itemType: r.itemType as ItemType,
        description: r.description,
        unitPrice: r.unitPrice,
        currency: r.currency,
        isActive: r.isActive,
      })),
    );
  }
}
