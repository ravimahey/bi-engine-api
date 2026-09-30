import type { ImportType } from '../entities';
import type { ColumnSpec } from './column-spec.interface';

/** Everything the app and the user need to know about one import type. */
export interface ImportDefinition {
  type: ImportType;
  /** Position in the required import order (1-based). */
  step: number;
  title: string;
  description: string;
  /** Types that must be imported first, because rows here reference them by name. */
  dependsOn: ImportType[];
  columns: ColumnSpec[];
  /** Example rows for the downloadable template, in `columns` order. */
  exampleRows: string[][];
  /** Extra rules shown in the format guide. */
  notes: string[];
}
