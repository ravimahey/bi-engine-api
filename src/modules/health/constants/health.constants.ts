/** Liveness/readiness route — version-neutral, outside the global API prefix so probes hit a stable path. */
export const HEALTH_ROUTE_PATH = 'health';

/** Max time the database ping check may take before being marked down. */
export const HEALTH_DB_TIMEOUT_MS = 3000;

/** Heap ceiling the memory indicator considers healthy. */
export const HEALTH_MAX_HEAP_BYTES = 512 * 1024 * 1024;
