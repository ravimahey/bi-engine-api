import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Not, IsNull } from 'typeorm';
import type { AuthenticatedUser } from '@common/decorators';
import { assertOwnOrganization } from '@common/utils';
import {
  ConnectionStatus,
  ProviderConnection,
} from '@modules/providers/entities';
import { CompanyProfile } from '@modules/records/entities';
import { UserRole } from '@modules/users/entities';
import { IMPORT_FALLBACK_CURRENCY } from '../constants';
import { ImportType } from '../entities';
import type { ImportContext, ImportIssue } from '../types';

/** Imports that add transactions — the ones that can double-count a synced provider's data. */
const TRANSACTION_TYPES = new Set<ImportType>([
  ImportType.EXPENSES,
  ImportType.VENDOR_CREDITS,
  ImportType.BILL_PAYMENTS,
  ImportType.SALES,
  ImportType.CUSTOMER_PAYMENTS,
]);

const PROVIDER_NAMES: Record<string, string> = {
  quickbooks: 'QuickBooks',
  xero: 'Xero',
  zoho: 'Zoho Books',
};

/** Organization-level facts an import needs: access, default currency, overlap warnings. */
@Injectable()
export class ImportContextService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  assertAccess(organizationId: string, user: AuthenticatedUser): void {
    if (user.role !== (UserRole.ADMIN as string)) {
      assertOwnOrganization(user.organizationId, organizationId);
    }
  }

  /** Default currency = the organization's base currency from any synced company profile, else USD. */
  async resolve(organizationId: string): Promise<ImportContext> {
    const profile = await this.dataSource
      .getRepository(CompanyProfile)
      .findOne({
        where: { organizationId, baseCurrency: Not(IsNull()) },
        order: { updatedAt: 'DESC' },
        select: { id: true, baseCurrency: true },
      });
    return {
      organizationId,
      defaultCurrency:
        profile?.baseCurrency?.trim() || IMPORT_FALLBACK_CURRENCY,
    };
  }

  /**
   * Analytics add up every source, so importing transactions that a
   * connected QuickBooks/Xero already syncs would count them twice. Can't be
   * detected row by row (different ids), so it's a warning the user
   * confirms past, not an error.
   */
  async overlapWarnings(
    organizationId: string,
    type: ImportType,
  ): Promise<ImportIssue[]> {
    if (!TRANSACTION_TYPES.has(type)) return [];
    const connected = await this.dataSource
      .getRepository(ProviderConnection)
      .find({
        where: { organizationId, status: ConnectionStatus.CONNECTED },
        select: { id: true, provider: true },
      });
    return connected.map(({ provider }) => ({
      severity: 'warning' as const,
      row: null,
      column: null,
      message: `Your organization also syncs ${PROVIDER_NAMES[provider] ?? provider}. Only import transactions that are not in ${PROVIDER_NAMES[provider] ?? provider}, or they will be counted twice in your totals.`,
    }));
  }
}
