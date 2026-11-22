import type { PostgrestError } from '@supabase/supabase-js';

export class ServiceError extends Error {
  code?: string;
  details?: string;
  constructor(err: PostgrestError | { message: string; code?: string; details?: string }) {
    super(err.message);
    this.code = err.code;
    this.details = err.details ?? undefined;
    this.name = 'ServiceError';
  }
}

export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw new ServiceError(res.error);
  return res.data as T;
}

/**
 * PostgREST returns at most 1000 rows per request by default; page through
 * so totals are never silently truncated.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const res = await build(from, from + pageSize - 1);
    if (res.error) throw new ServiceError(res.error);
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** Numeric columns can arrive as strings from some PostgREST configurations. */
export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
