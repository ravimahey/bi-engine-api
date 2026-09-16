import { Injectable } from '@nestjs/common';
import { QUICKBOOKS_MINOR_VERSION } from '../constants';
import { QuickbooksReportQueryDto } from '../dto';
import type { QuickbooksQueryEntity, QuickbooksReportName } from '../types';
import { QuickbooksApiClientService } from './quickbooks-api-client.service';

/**
 * Ongoing-sync and cross-check calls — QuickBooks API Build Order steps 9
 * and 10. Change Data Capture returns only records changed since a given
 * timestamp (so an ongoing sync never has to re-pull everything), and the
 * Reports API returns QuickBooks' own pre-aggregated totals to sanity-check
 * against numbers computed from our own line-item data — not a findings
 * source in its own right.
 */
@Injectable()
export class QuickbooksReportsService {
  constructor(private readonly apiClient: QuickbooksApiClientService) {}

  /** Records changed since `changedSince`, across every entity in `entities`, in one call. */
  getChangeDataCapture(
    entities: QuickbooksQueryEntity[],
    changedSince: string,
  ): Promise<unknown> {
    return this.apiClient.get(() => {
      const params = new URLSearchParams({
        entities: entities.join(','),
        changedSince,
        minorversion: String(QUICKBOOKS_MINOR_VERSION),
      });
      return `/cdc?${params.toString()}`;
    });
  }

  /** One of QuickBooks' pre-aggregated reports, optionally scoped to a date range. */
  getReport(
    reportName: QuickbooksReportName,
    query: QuickbooksReportQueryDto,
  ): Promise<unknown> {
    return this.apiClient.get(() => {
      const params = new URLSearchParams({
        minorversion: String(QUICKBOOKS_MINOR_VERSION),
      });
      if (query.startDate) {
        params.set('start_date', query.startDate);
      }
      if (query.endDate) {
        params.set('end_date', query.endDate);
      }
      return `/reports/${reportName}?${params.toString()}`;
    });
  }
}
