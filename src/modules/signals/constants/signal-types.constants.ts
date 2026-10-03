import { SignalSeverity, SignalSourceType, SignalType } from '../entities';
import type { SignalTypeDefinition } from '../types';

/**
 * The one place a signal type's severity, source type and default title
 * live. `SignalsService.createSignal` reads all three from here, so a
 * producer can never guess (or drift on) how urgent its own signal is.
 */
export const SIGNAL_TYPES: Record<SignalType, SignalTypeDefinition> = {
  [SignalType.ORDER_NEEDS_ACTION]: {
    severity: SignalSeverity.WARNING,
    sourceType: SignalSourceType.ORDER,
    title: 'Order needs your confirmation',
  },
  [SignalType.ORDER_READY_TO_PACK]: {
    severity: SignalSeverity.INFO,
    sourceType: SignalSourceType.ORDER,
    title: 'New order ready to pack',
  },
  [SignalType.ADJUSTMENT_REJECTED]: {
    severity: SignalSeverity.WARNING,
    sourceType: SignalSourceType.ORDER,
    title: 'Adjustment rejected',
  },
  [SignalType.COST_INCREASE]: {
    severity: SignalSeverity.WARNING,
    sourceType: SignalSourceType.FINDING,
    title: 'Costs increased',
  },
  [SignalType.POSSIBLE_DUPLICATE]: {
    severity: SignalSeverity.WARNING,
    sourceType: SignalSourceType.FINDING,
    title: 'Possible duplicate bill',
  },
  [SignalType.DATA_QUALITY]: {
    severity: SignalSeverity.INFO,
    sourceType: SignalSourceType.FINDING,
    title: 'Data quality issue',
  },
  [SignalType.INVOICE_OVERDUE]: {
    severity: SignalSeverity.URGENT,
    sourceType: SignalSourceType.INVOICE,
    title: 'Invoice overdue',
  },
  [SignalType.SYNC_ERROR]: {
    severity: SignalSeverity.URGENT,
    sourceType: SignalSourceType.CONNECTION,
    title: 'Integration sync failed',
  },
};
