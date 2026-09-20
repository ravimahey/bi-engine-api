import type { QueryRunner } from 'typeorm';
import dataSource from '../data-source';

/**
 * Dev-only seeder: inserts vendors + deliberately duplicated expense
 * transactions (same vendor + date + amount) for one organization so
 * `GET duplicate-transactions` / `duplicate-transactions/explain` return data.
 * Idempotent — rows use fixed `source_external_id`s with ON CONFLICT DO NOTHING.
 *
 * Run: pnpm seed:duplicates [organizationId]
 */
const DEFAULT_ORGANIZATION_ID = '0c03e12f-394d-44f2-9c81-f4d34482c2a8';

interface VendorSeed {
  key: string;
  displayName: string;
}

interface DuplicateSeed {
  vendorKey: string;
  date: string;
  amount: number;
  copies: number;
  type: 'bill' | 'purchase';
}

const VENDORS: VendorSeed[] = [
  { key: 'acme', displayName: 'Acme Office Supplies' },
  { key: 'globex', displayName: 'Globex Cloud Hosting' },
  { key: 'initech', displayName: 'Initech Consulting' },
  { key: 'umbrella', displayName: 'Umbrella Logistics' },
];

const DUPLICATES: DuplicateSeed[] = [
  {
    vendorKey: 'acme',
    date: '2026-08-03',
    amount: 1250.0,
    copies: 2,
    type: 'bill',
  },
  {
    vendorKey: 'globex',
    date: '2026-08-10',
    amount: 4890.5,
    copies: 3,
    type: 'bill',
  },
  {
    vendorKey: 'initech',
    date: '2026-08-17',
    amount: 7200.0,
    copies: 2,
    type: 'purchase',
  },
  {
    vendorKey: 'umbrella',
    date: '2026-09-01',
    amount: 315.75,
    copies: 2,
    type: 'purchase',
  },
];

// Same vendor but distinct date/amount — must NOT be flagged as duplicates.
const NON_DUPLICATES: Omit<DuplicateSeed, 'copies'>[] = [
  { vendorKey: 'acme', date: '2026-08-04', amount: 1250.0, type: 'bill' },
  { vendorKey: 'globex', date: '2026-08-10', amount: 4890.51, type: 'bill' },
];

async function rows<T>(
  runner: QueryRunner,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  return (await runner.query(sql, params)) as T[];
}

async function seed(): Promise<void> {
  const organizationId = process.argv[2] ?? DEFAULT_ORGANIZATION_ID;
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  try {
    const org = await rows<{ id: string }>(
      runner,
      `SELECT id FROM organizations WHERE id = $1`,
      [organizationId],
    );
    if (org.length === 0) {
      throw new Error(`Organization ${organizationId} does not exist`);
    }

    const vendorIds = new Map<string, string>();
    for (const vendor of VENDORS) {
      const externalId = `seed-dup-vendor-${vendor.key}`;
      await runner.query(
        `INSERT INTO vendors (organization_id, source_system, source_external_id, display_name)
         VALUES ($1, 'manual', $2, $3)
         ON CONFLICT (organization_id, source_system, source_external_id) DO NOTHING`,
        [organizationId, externalId, vendor.displayName],
      );
      const [row] = await rows<{ id: string }>(
        runner,
        `SELECT id FROM vendors
         WHERE organization_id = $1 AND source_system = 'manual' AND source_external_id = $2`,
        [organizationId, externalId],
      );
      vendorIds.set(vendor.key, row.id);
    }

    let inserted = 0;
    const insertTransaction = async (
      seedRow: Omit<DuplicateSeed, 'copies'>,
      externalId: string,
    ) => {
      const result = await rows<{ id: string }>(
        runner,
        `INSERT INTO expense_transactions
           (organization_id, source_system, source_external_id, transaction_type,
            vendor_id, transaction_date, total_amount, currency)
         VALUES ($1, 'manual', $2, $3, $4, $5, $6, 'USD')
         ON CONFLICT (organization_id, source_system, source_external_id) DO NOTHING
         RETURNING id`,
        [
          organizationId,
          externalId,
          seedRow.type,
          vendorIds.get(seedRow.vendorKey),
          seedRow.date,
          seedRow.amount,
        ],
      );
      inserted += result.length;
    };

    for (const dup of DUPLICATES) {
      for (let copy = 1; copy <= dup.copies; copy++) {
        await insertTransaction(
          dup,
          `seed-dup-${dup.vendorKey}-${dup.date}-${copy}`,
        );
      }
    }
    for (const single of NON_DUPLICATES) {
      await insertTransaction(
        single,
        `seed-single-${single.vendorKey}-${single.date}`,
      );
    }

    await runner.commitTransaction();
    console.log(
      `Seeded organization ${organizationId}: ${inserted} new transactions ` +
        `(${DUPLICATES.length} duplicate groups expected).`,
    );
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
