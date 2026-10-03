import { Injectable, Logger } from '@nestjs/common';
import { SignalType } from '@modules/signals/entities';
import { SignalsService } from '@modules/signals/services';
import type { CreateSignalInput } from '@modules/signals/types';
import { MAX_DUPLICATE_SIGNALS } from '../constants';
import {
  buildFindingId,
  costIncreaseMessage,
  costIncreaseTitle,
  currentMonthWindow,
  lastFullMonthWindows,
  missingSupplierMessage,
  possibleDuplicateMessage,
} from '../utils';
import { CategoryPriceIncreaseScanService } from './category-price-increase-scan.service';
import { DataQualityService } from './data-quality.service';
import { DuplicateDetectionService } from './duplicate-detection.service';

type FindingSignal = Omit<CreateSignalInput, 'organizationId' | 'type'>;

/**
 * BI engine → Signals. After an organization's data changes (a provider
 * sync or a spreadsheet import), re-runs the detectors for that one
 * organization and tells Signals which findings now exist and which are
 * gone. It is triggered by the data change, not by a schedule, and only
 * ever looks at the organization that changed.
 *
 * The detectors own every number; this class only turns their results into
 * `createSignal`/`resolveSignal` calls. Each finding's id is derived from
 * what it is about (`buildFindingId`), so the same finding seen on every
 * sync maps to the same signal instead of a new one.
 */
@Injectable()
export class FindingSignalsService {
  private readonly logger = new Logger(FindingSignalsService.name);

  constructor(
    private readonly signals: SignalsService,
    private readonly duplicateDetection: DuplicateDetectionService,
    private readonly dataQuality: DataQualityService,
    private readonly categoryPriceIncreases: CategoryPriceIncreaseScanService,
  ) {}

  /**
   * Never throws — signals are a side effect of a sync/import and must not
   * fail it. Each detector is isolated too, so one failing query doesn't
   * cost the other two their signals.
   */
  async refreshForOrganization(
    organizationId: string,
    today: Date = new Date(),
  ): Promise<void> {
    await this.run(SignalType.COST_INCREASE, organizationId, () =>
      this.detectCostIncreases(organizationId, today),
    );
    await this.run(SignalType.POSSIBLE_DUPLICATE, organizationId, () =>
      this.detectDuplicates(organizationId),
    );
    await this.run(SignalType.DATA_QUALITY, organizationId, () =>
      this.detectMissingSuppliers(organizationId, today),
    );
  }

  private async detectCostIncreases(organizationId: string, today: Date) {
    const windows = lastFullMonthWindows(today);
    const findings = await this.categoryPriceIncreases.findPriceIncreases(
      organizationId,
      windows,
    );

    return {
      raise: findings.map((finding) => ({
        sourceId: buildFindingId(
          organizationId,
          SignalType.COST_INCREASE,
          finding.categoryId,
          windows.currentFrom,
        ),
        title: costIncreaseTitle(finding),
        message: costIncreaseMessage(finding),
      })),
    };
  }

  private async detectDuplicates(organizationId: string) {
    const groups =
      await this.duplicateDetection.findGroupsForOrganization(organizationId);

    const found = groups.map((group) => ({
      sourceId: buildFindingId(
        organizationId,
        SignalType.POSSIBLE_DUPLICATE,
        group.vendorId ?? '',
        group.transactionDate,
        group.totalAmount.toFixed(2),
      ),
      message: possibleDuplicateMessage(group),
    }));

    // Groups arrive most-repeated first; every group still counts as
    // "found" so a capped-out group's existing signal is never resolved.
    return { raise: found.slice(0, MAX_DUPLICATE_SIGNALS), found };
  }

  private async detectMissingSuppliers(organizationId: string, today: Date) {
    const month = currentMonthWindow(today);
    const count = await this.dataQuality.countMissingSupplier(
      organizationId,
      month.from,
      month.to,
    );
    if (count === 0) return { raise: [] };

    return {
      raise: [
        {
          sourceId: buildFindingId(
            organizationId,
            SignalType.DATA_QUALITY,
            'missing_supplier',
            month.from,
          ),
          message: missingSupplierMessage(count),
        },
      ],
    };
  }

  /**
   * Raises a signal per finding, then resolves every active signal of this
   * type whose finding the detector no longer reports (fixed, or its period
   * has passed). Resolving only runs after a successful detection, so a
   * failed query can never wipe valid signals.
   */
  private async run(
    type: SignalType,
    organizationId: string,
    detect: () => Promise<{ raise: FindingSignal[]; found?: FindingSignal[] }>,
  ): Promise<void> {
    try {
      const { raise, found = raise } = await detect();

      for (const finding of raise) {
        // A detector re-reports the same finding on every sync — respect a
        // user's dismissal instead of bringing the signal back each time.
        await this.signals.createSignal(
          { organizationId, type, ...finding },
          { skipIfUserDismissed: true },
        );
      }

      await this.signals.resolveStaleSignals({
        organizationId,
        type,
        activeSourceIds: found.map((finding) => finding.sourceId),
      });
    } catch (error) {
      this.logger.error(
        `Could not refresh ${type} signals for org ${organizationId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
