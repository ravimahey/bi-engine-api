import { SetMetadata } from '@nestjs/common';
import { REQUEST_TIMEOUT_KEY } from '../constants/app.constants';

/**
 * Overrides the global `REQUEST_TIMEOUT_MS` for one route — for handlers that
 * legitimately run long, like a provider sync: `@RequestTimeout(600_000)`
 */
export const RequestTimeout = (timeoutMs: number) =>
  SetMetadata(REQUEST_TIMEOUT_KEY, timeoutMs);
