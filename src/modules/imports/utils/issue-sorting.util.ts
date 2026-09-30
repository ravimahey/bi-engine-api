import type { ImportIssue } from '../types';

/** File-level issues first, then by row; errors before warnings within a row. */
export function sortIssues(issues: ImportIssue[]): ImportIssue[] {
  return [...issues].sort(
    (a, b) =>
      (a.row ?? 0) - (b.row ?? 0) ||
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1),
  );
}
