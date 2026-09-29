import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
  TransactionPayment,
  VendorCredit,
} from '../entities';
import type { SourceSystem } from '../entities';

/**
 * Removes canonical spend rows whose source record no longer counts as
 * spend — e.g. a Xero bill that was voided or deleted after an earlier sync.
 * Without this, a previously synced row would keep inflating spend totals
 * forever. These are hard deletes on purpose: the (organization,
 * sourceSystem, sourceExternalId) unique index also covers soft-deleted
 * rows, so a soft-deleted row would block the same source record from ever
 * being re-created if it becomes live again (e.g. a draft later approved).
 * Split out from `RecordsService` (which owns inserts/updates) to keep each
 * file a single responsibility.
 */
@Injectable()
export class RecordsRemovalService {
  constructor(
    @InjectRepository(VendorCredit)
    private readonly vendorCredits: Repository<VendorCredit>,
    @InjectRepository(TransactionPayment)
    private readonly payments: Repository<TransactionPayment>,
    private readonly dataSource: DataSource,
  ) {}

  /** Deletes an `ExpenseTransaction` and its lines together; returns whether a row existed. */
  async removeExpenseTransaction(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(ExpenseTransaction);
      const existing = await transactionRepo.findOne({
        where: { organizationId, sourceSystem, sourceExternalId },
        select: { id: true },
        withDeleted: true,
      });
      if (!existing) return false;

      await manager
        .getRepository(ExpenseTransactionLine)
        .delete({ transactionId: existing.id });
      await transactionRepo.delete({ id: existing.id });
      return true;
    });
  }

  async removeVendorCredit(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<boolean> {
    const result = await this.vendorCredits.delete({
      organizationId,
      sourceSystem,
      sourceExternalId,
    });
    return (result.affected ?? 0) > 0;
  }

  async removeTransactionPayment(
    organizationId: string,
    sourceSystem: SourceSystem,
    sourceExternalId: string,
  ): Promise<boolean> {
    const result = await this.payments.delete({
      organizationId,
      sourceSystem,
      sourceExternalId,
    });
    return (result.affected ?? 0) > 0;
  }
}
