import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type { SourceSystem } from '../entities';

/** Keeps each statement well under Postgres' 65,535 bind-parameter limit. */
const CHUNK_SIZE = 500;

const chunk = <T>(items: T[]): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    chunks.push(items.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
};

/**
 * Set-based writes into the canonical records/* tables, for sources that
 * deliver many rows at once (CSV/Excel imports). Every method runs on the
 * caller's `EntityManager`, so a whole import commits or rolls back as one
 * transaction. The per-row upserts in `RecordsService` stay as they are for
 * the provider mappers; this is the batch equivalent with the same
 * (organization, sourceSystem, sourceExternalId) identity, so re-importing
 * the same file updates rows instead of duplicating them.
 */
@Injectable()
export class RecordsBulkService {
  /**
   * Inserts or updates provenanced rows in bulk via `ON CONFLICT` on the
   * provenance unique index, then returns sourceExternalId → canonical id
   * for every row written.
   */
  async upsertProvenanced<T extends ObjectLiteral>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    rows: Array<
      QueryDeepPartialEntity<T> & {
        organizationId: string;
        sourceSystem: SourceSystem;
        sourceExternalId: string;
      }
    >,
  ): Promise<Map<string, string>> {
    if (rows.length === 0) return new Map();

    for (const batch of chunk(rows)) {
      await manager.upsert(entity, batch, {
        conflictPaths: ['organizationId', 'sourceSystem', 'sourceExternalId'],
      });
    }

    const { organizationId, sourceSystem } = rows[0];
    return this.findIdsByExternalIds(
      manager,
      entity,
      organizationId,
      sourceSystem,
      rows.map((row) => row.sourceExternalId),
    );
  }

  /** sourceExternalId → canonical id, for whichever of `externalIds` exist (soft-deleted rows excluded). */
  async findIdsByExternalIds<T extends ObjectLiteral>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    organizationId: string,
    sourceSystem: SourceSystem,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    const unique = [...new Set(externalIds)];

    for (const batch of chunk(unique)) {
      const found = await manager
        .getRepository(entity)
        .createQueryBuilder('row')
        .select(['row.id AS id', 'row.sourceExternalId AS "externalId"'])
        .where('row.organizationId = :organizationId', { organizationId })
        .andWhere('row.sourceSystem = :sourceSystem', { sourceSystem })
        .andWhere('row.sourceExternalId IN (:...batch)', { batch })
        .andWhere('row.deletedAt IS NULL')
        .getRawMany<{ id: string; externalId: string }>();
      found.forEach(({ id, externalId }) => ids.set(externalId, id));
    }
    return ids;
  }

  /**
   * Replaces every line of `transactionIds` with `lines` — the batch form
   * of `RecordsService.upsertExpenseTransaction`'s "replace all lines" rule,
   * so a line removed from the source file is removed here too. Works for
   * both `ExpenseTransactionLine` and `SalesTransactionLine`.
   */
  async replaceLines<T extends ObjectLiteral>(
    manager: EntityManager,
    lineEntity: EntityTarget<T>,
    transactionIds: string[],
    lines: QueryDeepPartialEntity<T>[],
  ): Promise<void> {
    const repository = manager.getRepository(lineEntity);
    for (const batch of chunk(transactionIds)) {
      await repository.delete({ transactionId: In(batch) } as never);
    }
    for (const batch of chunk(lines)) {
      await repository.insert(batch);
    }
  }
}
