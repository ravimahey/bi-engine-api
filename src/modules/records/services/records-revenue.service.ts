import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Customer,
  CustomerPayment,
  SalesTransaction,
  SalesTransactionLine,
} from '../entities';
import type {
  UpsertCustomerInput,
  UpsertCustomerPaymentInput,
  UpsertSalesTransactionInput,
} from '../types';

/**
 * Owns every write to the revenue-side canonical records/* tables —
 * Customer, SalesTransaction+Lines, CustomerPayment. Sibling of
 * `RecordsService` (spend side + master data), split out purely to keep
 * each file within this repo's size guidance; same
 * (organization, sourceSystem, sourceExternalId) upsert-matching contract.
 * `SalesTransaction` has no direct repository here — every write to it goes
 * through `dataSource.transaction()` below so the header and its lines save
 * atomically, mirroring `RecordsService.upsertExpenseTransaction`.
 */
@Injectable()
export class RecordsRevenueService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(CustomerPayment)
    private readonly customerPayments: Repository<CustomerPayment>,
    private readonly dataSource: DataSource,
  ) {}

  async upsertCustomer(input: UpsertCustomerInput): Promise<Customer> {
    const existing = await this.customers.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const customer = existing
      ? Object.assign(existing, input)
      : this.customers.create(input);

    return this.customers.save(customer);
  }

  /**
   * Upserts a `SalesTransaction` header and fully replaces its lines in one
   * transaction — the revenue-side mirror of
   * `RecordsService.upsertExpenseTransaction`, same "the provider always
   * sends the complete line set" reasoning.
   */
  async upsertSalesTransaction(
    input: UpsertSalesTransactionInput,
  ): Promise<SalesTransaction> {
    const { lines, ...header } = input;

    return this.dataSource.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(SalesTransaction);
      const lineRepo = manager.getRepository(SalesTransactionLine);

      const existing = await transactionRepo.findOne({
        where: {
          organizationId: header.organizationId,
          sourceSystem: header.sourceSystem,
          sourceExternalId: header.sourceExternalId,
        },
      });

      const transaction = existing
        ? Object.assign(existing, header)
        : transactionRepo.create(header);
      const saved = await transactionRepo.save(transaction);

      await lineRepo.delete({ transactionId: saved.id });
      if (lines.length > 0) {
        await lineRepo.insert(
          lines.map((line) => ({
            ...line,
            transactionId: saved.id,
            organizationId: saved.organizationId,
            customerId: saved.customerId,
            transactionDate: saved.transactionDate,
          })),
        );
      }

      return saved;
    });
  }

  async upsertCustomerPayment(
    input: UpsertCustomerPaymentInput,
  ): Promise<CustomerPayment> {
    const existing = await this.customerPayments.findOne({
      where: {
        organizationId: input.organizationId,
        sourceSystem: input.sourceSystem,
        sourceExternalId: input.sourceExternalId,
      },
    });

    const payment = existing
      ? Object.assign(existing, input)
      : this.customerPayments.create(input);

    return this.customerPayments.save(payment);
  }
}
