/**
 * Tour keys are chosen by the frontend (e.g. `onboarding:supplier`,
 * `page:insights-overview`) — the backend only stores progress against
 * them, so it validates their shape rather than an allow-list that would
 * need a backend deploy every time a new page tour ships.
 */
export const WALKTHROUGH_TOUR_KEY_PATTERN = /^[a-z0-9][a-z0-9:_-]*$/;
export const WALKTHROUGH_TOUR_KEY_MAX_LENGTH = 100;

/**
 * Upper bound on rows returned by `GET /walkthroughs/me`. One row per tour a
 * user has touched — a few dozen at most — so this is a safety cap rather
 * than real pagination.
 */
export const WALKTHROUGH_LIST_LIMIT = 200;

/** Highest step index a client may report — no tour comes close to this. */
export const WALKTHROUGH_MAX_STEP = 500;
