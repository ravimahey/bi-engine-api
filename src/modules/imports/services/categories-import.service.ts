import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { SourceSystem, SpendCategory } from '@modules/records/entities';
import { RecordsBulkService } from '@modules/records/services';
import { IMPORT_PREVIEW_ROWS } from '../constants';
import type {
  CategoryRecord,
  ImportContext,
  ImportHandler,
  ImportIssue,
  ImportValidation,
  ReadRow,
} from '../types';
import {
  categoryKey,
  cell,
  flag,
  flagDuplicateNames,
  summarize,
  text,
} from '../utils';
import { ImportLookupService } from './import-lookup.service';

const HEADER = 'Category Name';
const PARENT = 'Parent Category';

/**
 * Step 3 — Categories file → canonical `SpendCategory` rows. A parent may
 * be another row in the same file (in any order) or a category imported
 * earlier; a parent that is neither, a self-parent, or a parent loop
 * (A → B → A, even through earlier imports) is an error.
 */
@Injectable()
export class CategoriesImportService implements ImportHandler<CategoryRecord> {
  constructor(
    private readonly lookup: ImportLookupService,
    private readonly bulk: RecordsBulkService,
  ) {}

  async validate(
    rows: ReadRow[],
    context: ImportContext,
  ): Promise<ImportValidation<CategoryRecord>> {
    const issues: ImportIssue[] = [];
    flagDuplicateNames(rows, HEADER, issues);

    const records: CategoryRecord[] = [];
    // Row number and parent name as typed, per record — for messages and the preview.
    const source = new Map<
      string,
      { row: number; parentName: string | null }
    >();
    for (const row of rows) {
      const name = text(row, 'name');
      if (!name) continue;
      const parentName = text(row, 'parent');
      const record: CategoryRecord = {
        key: categoryKey(name),
        name,
        categoryType: text(row, 'categoryType'),
        parentKey: parentName ? categoryKey(parentName) : null,
        isActive: flag(row, 'active') ?? true,
      };
      if (record.parentKey === record.key) {
        this.parentIssue(
          issues,
          row.rowNumber,
          parentName,
          'A category cannot be its own parent.',
        );
        record.parentKey = null;
      }
      records.push(record);
      source.set(record.key, { row: row.rowNumber, parentName });
    }

    // Parent links as they'd be after this import: earlier imports, overridden by this file.
    const parents = await this.lookup.categoryParents(context.organizationId);
    for (const record of records) parents.set(record.key, record.parentKey);

    for (const record of records) {
      if (!record.parentKey) continue;
      const { row, parentName } = source.get(record.key)!;
      if (!parents.has(record.parentKey)) {
        this.parentIssue(
          issues,
          row,
          parentName,
          `Parent category "${parentName}" is not in this file and was not imported before. Add it as its own row.`,
        );
      } else if (this.hasLoop(record.key, parents)) {
        this.parentIssue(
          issues,
          row,
          parentName,
          `Making "${parentName}" the parent of "${record.name}" creates a loop — a category would end up inside itself.`,
        );
      }
    }

    const keys = records.map((r) => r.key);
    const existing = await this.lookup.existing(
      SpendCategory,
      context.organizationId,
      keys,
    );
    return {
      records,
      issues,
      summary: summarize(keys, existing),
      preview: records.slice(0, IMPORT_PREVIEW_ROWS).map((r) => ({
        [HEADER]: r.name,
        Type: cell(r.categoryType),
        [PARENT]: cell(source.get(r.key)?.parentName),
        Active: cell(r.isActive),
        Action: existing.has(r.key) ? 'Update' : 'Create',
      })),
    };
  }

  /**
   * Two passes in the commit transaction: upsert every category (so rows
   * whose parent is also new get ids), then set each parent id.
   */
  async commit(
    records: CategoryRecord[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<void> {
    const toRow = (r: CategoryRecord, parentCategoryId: string | null) => ({
      organizationId: context.organizationId,
      sourceSystem: SourceSystem.CSV,
      sourceExternalId: r.key,
      sourceConnectionId: null,
      name: r.name,
      fullyQualifiedName: null,
      categoryType: r.categoryType,
      parentCategoryId,
      isActive: r.isActive,
    });

    const ids = await this.bulk.upsertProvenanced(
      manager,
      SpendCategory,
      records.map((r) => toRow(r, null)),
    );
    const parentKeys = records
      .map((r) => r.parentKey)
      .filter((k): k is string => !!k);
    if (parentKeys.length === 0) return;

    const parentIds = await this.lookup.requireIds(
      manager,
      SpendCategory,
      context.organizationId,
      parentKeys,
      'parent categories',
    );
    parentIds.forEach((id, key) => ids.set(key, id));
    await this.bulk.upsertProvenanced(
      manager,
      SpendCategory,
      records.map((r) =>
        toRow(r, r.parentKey ? (ids.get(r.parentKey) ?? null) : null),
      ),
    );
  }

  private parentIssue(
    issues: ImportIssue[],
    row: number,
    parentName: string | null,
    message: string,
  ): void {
    issues.push({
      severity: 'error',
      row,
      column: PARENT,
      value: parentName ?? '',
      message,
    });
  }

  private hasLoop(start: string, parents: Map<string, string | null>): boolean {
    const seen = new Set<string>([start]);
    let current = parents.get(start) ?? null;
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parents.get(current) ?? null;
    }
    return false;
  }
}
