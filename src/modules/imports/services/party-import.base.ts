import type { EntityManager } from 'typeorm';
import { Customer, SourceSystem, Vendor } from '@modules/records/entities';
import type { RecordsBulkService } from '@modules/records/services';
import { IMPORT_PREVIEW_ROWS } from '../constants';
import type {
  ImportContext,
  ImportHandler,
  ImportIssue,
  ImportValidation,
  PartyRecord,
  ReadRow,
} from '../types';
import { cell, flag, flagDuplicateNames, summarize, text } from '../utils';
import type { ImportLookupService } from './import-lookup.service';

/**
 * Vendors and customers import identically — a name plus optional contact
 * details — into two different canonical tables. The two concrete services
 * only choose the table, key and wording.
 */
export abstract class PartyImportBase implements ImportHandler<PartyRecord> {
  protected abstract readonly entity: typeof Vendor | typeof Customer;
  protected abstract readonly nameHeader: string;
  protected abstract keyOf(name: string): string;

  constructor(
    protected readonly lookup: ImportLookupService,
    protected readonly bulk: RecordsBulkService,
  ) {}

  async validate(
    rows: ReadRow[],
    context: ImportContext,
  ): Promise<ImportValidation<PartyRecord>> {
    const issues: ImportIssue[] = [];
    flagDuplicateNames(rows, this.nameHeader, issues);

    const records: PartyRecord[] = rows
      .filter((row) => text(row, 'name'))
      .map((row) => {
        const name = text(row, 'name') as string;
        return {
          key: this.keyOf(name),
          name,
          email: text(row, 'email'),
          phone: text(row, 'phone'),
          isActive: flag(row, 'active') ?? true,
        };
      });

    const keys = records.map((r) => r.key);
    const existing = await this.lookup.existing(
      this.entity,
      context.organizationId,
      keys,
    );

    return {
      records,
      issues,
      summary: summarize(keys, existing),
      preview: records.slice(0, IMPORT_PREVIEW_ROWS).map((r) => ({
        [this.nameHeader]: r.name,
        Email: cell(r.email),
        Phone: cell(r.phone),
        Active: cell(r.isActive),
        Action: existing.has(r.key) ? 'Update' : 'Create',
      })),
    };
  }

  async commit(
    records: PartyRecord[],
    context: ImportContext,
    manager: EntityManager,
  ): Promise<void> {
    await this.bulk.upsertProvenanced(
      manager,
      this.entity,
      records.map((r) => ({
        organizationId: context.organizationId,
        sourceSystem: SourceSystem.CSV,
        sourceExternalId: r.key,
        sourceConnectionId: null,
        displayName: r.name,
        email: r.email,
        phone: r.phone,
        isActive: r.isActive,
      })),
    );
  }
}
