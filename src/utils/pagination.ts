import { Response } from 'express';

export interface PaginationQuery {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export function getPagination(query: any): PaginationQuery {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const sortBy = query.sortBy as string | undefined;
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const search = query.search as string | undefined;
  return { page, limit, sortBy, sortOrder, search };
}

export function buildPaginationMeta(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    total,
    totalPages,
  };
}
