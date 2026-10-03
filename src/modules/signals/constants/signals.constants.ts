import { SignalStatus } from '../entities';

/**
 * Statuses that count as "still in the inbox". The dedup rule — one active
 * signal per (organization, type, source) — is scoped to exactly these, and
 * must match the `WHERE` of the `idx_signals_dedup_active` index.
 */
export const ACTIVE_SIGNAL_STATUSES = [
  SignalStatus.UNREAD,
  SignalStatus.READ,
] as const;

/** The only statuses a user may set — never `unread`. */
export const USER_SETTABLE_SIGNAL_STATUSES = [
  SignalStatus.READ,
  SignalStatus.DISMISSED,
] as const;

export const SIGNAL_TITLE_MAX_LENGTH = 200;

export const SIGNALS_DEFAULT_LIMIT = 20;
export const SIGNALS_MAX_LIMIT = 100;
