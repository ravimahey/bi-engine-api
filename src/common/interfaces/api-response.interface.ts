export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** Shape returned by services that page their results. */
export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface SuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
  timestamp: string;
  path: string;
  requestId?: string;
}

export interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  error: string;
  /** Field-level details, present for validation failures. */
  details?: Record<string, string[]> | string[];
  timestamp: string;
  path: string;
  requestId?: string;
  stack?: string;
}

export const isPaginated = <T>(value: unknown): value is Paginated<T> =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as Paginated<T>).items) &&
  typeof (value as Paginated<T>).meta === 'object' &&
  (value as Paginated<T>).meta !== null &&
  typeof (value as Paginated<T>).meta.total === 'number';
