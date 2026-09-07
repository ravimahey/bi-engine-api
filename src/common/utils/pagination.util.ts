import type {
  Paginated,
  PaginationMeta,
} from '../interfaces/api-response.interface';

export const buildPaginationMeta = (
  total: number,
  page: number,
  limit: number,
): PaginationMeta => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    total,
    page,
    limit,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
};

/** Wraps a TypeORM `findAndCount()` tuple into the paginated service contract. */
export const paginate = <T>(
  [items, total]: [T[], number],
  page: number,
  limit: number,
): Paginated<T> => ({
  items,
  meta: buildPaginationMeta(total, page, limit),
});
