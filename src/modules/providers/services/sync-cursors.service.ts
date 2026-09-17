import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncCursor } from '../entities';

/**
 * Owns `sync_cursors` CRUD. Kept provider-agnostic: callers pass whatever
 * `entityType`/`cursor` strings make sense for their own API — this service
 * only guarantees one checkpoint row per (connection, entity type).
 */
@Injectable()
export class SyncCursorsService {
  constructor(
    @InjectRepository(SyncCursor)
    private readonly cursors: Repository<SyncCursor>,
  ) {}

  async get(
    providerConnectionId: string,
    entityType: string,
  ): Promise<SyncCursor | null> {
    return this.cursors.findOne({
      where: { providerConnectionId, entityType },
    });
  }

  /** Every checkpoint row for one connection, across every entity type — one query, for a sync-status read rather than one `get()` per entity. */
  async findAllForConnection(
    providerConnectionId: string,
  ): Promise<SyncCursor[]> {
    return this.cursors.find({ where: { providerConnectionId } });
  }

  async upsert(
    providerConnectionId: string,
    entityType: string,
    cursor: string,
  ): Promise<SyncCursor> {
    const existing = await this.get(providerConnectionId, entityType);

    const record =
      existing ?? this.cursors.create({ providerConnectionId, entityType });

    record.cursor = cursor;
    record.lastSyncedAt = new Date();

    return this.cursors.save(record);
  }
}
