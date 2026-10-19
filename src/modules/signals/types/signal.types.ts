import type {
  Signal,
  SignalSeverity,
  SignalSourceType,
  SignalType,
} from '../entities';

/** One entry of the central `SIGNAL_TYPES` registry. */
export interface SignalTypeDefinition {
  severity: SignalSeverity;
  sourceType: SignalSourceType;
  /** Default title; a producer may override it (e.g. "Packaging costs increased"). */
  title: string;
}

/**
 * The dedup key: at most one active signal per key. `sourceType` isn't part
 * of the input because the registry fixes it per `type`.
 */
export interface SignalKey {
  /** The recipient organization — the producer picks the right side (buyer vs supplier). */
  organizationId: string;
  type: SignalType;
  sourceId: string;
}

export interface PriceNegotiationTimelineItem {
  step: string;
  actor: 'buyer' | 'seller' | 'system';
  timestamp: string;
  message: string;
  price?: number;
  savings?: number;
}

export interface PriceNegotiationState {
  status:
    | 'detected'
    | 'clarification_requested'
    | 'negotiating'
    | 'revised_agreement'
    | 'verified';
  clarificationMessage?: string;
  clarificationDate?: string;
  sellerResponse?: string;
  sellerResponseDate?: string;
  sellerProposedPrice?: number;
  agreedRevisedPrice?: number;
  agreedDate?: string;
  calculatedSavings?: number;
  revisedInvoiceNumber?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
  timeline: PriceNegotiationTimelineItem[];
}

export interface PriceIncreaseEvidence {
  vendorId: string;
  vendorName: string;
  itemId: string;
  itemName: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  lineId?: string;
  quantity: number;
  unit: string;
  agreedPrice: number;
  invoicePrice: number;
  priceDifference: number;
  priceIncreasePercent: number;
  totalInvoiceAmount: number;
  historicalAgreedTotal: number;
  potentialAdditionalCost: number;
  currency: string;
  recommendedActions: string[];
  negotiation?: PriceNegotiationState;
}

export interface CreateSignalInput extends SignalKey {
  /**
   * Short display text, already rendered by the producer from a fixed
   * template. Any number in it was computed by the producer — Signals never
   * calculates.
   */
  message: string;
  /** Overrides the registry's default title. */
  title?: string;
  /** Rich supporting evidence payload (e.g. price increase comparison, invoices, negotiation state). */
  metadata?: Record<string, any> | null;
}

export interface CreateSignalOptions {
  /**
   * For producers that re-evaluate the same source repeatedly (a detector
   * re-run on every sync) rather than firing once per state change: don't
   * raise the signal again once the user has dismissed it, or every sync
   * would undo the dismissal.
   */
  skipIfUserDismissed?: boolean;
}

export interface ResolveStaleSignalsInput {
  organizationId: string;
  type: SignalType;
  /** Sources whose condition still holds; every other active signal of this type is resolved. */
  activeSourceIds: string[];
}

/** One page of the feed; `nextCursor` is null on the last page. */
export interface SignalFeedPage {
  items: Signal[];
  nextCursor: string | null;
}

/** Position of the last row of a page: strictly older rows come next. */
export interface SignalCursor {
  /** `created_at` at full microsecond precision, as Postgres printed it. */
  createdAt: string;
  id: string;
}
