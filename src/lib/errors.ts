/** Turns Supabase / Postgres / JS errors into a message a non-technical user can act on. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong.';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; code?: string; details?: string; hint?: string };
  const msg = e.message ?? String(err);
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return /row-level security|permission denied/i.test(msg)
      ? 'You do not have permission to perform this action.'
      : msg;
  }
  if (msg.startsWith('DUPLICATE_EXPENSE')) return 'This looks like a duplicate expense (same provider, invoice number, category and amount).';
  if (e.code === '23505') {
    if (/item_code/.test(msg)) return 'An item with this code already exists.';
    if (/name_uq/.test(msg)) return 'A record with this name already exists.';
    if (/currency_code, effective_date|exchange_rates/.test(msg)) return 'A rate for this currency and date already exists.';
    return 'This record already exists.';
  }
  if (e.code === '23503') return 'This record is linked to other records and cannot be removed.';
  if (e.code === '23514') return `A value is not allowed: ${e.details ?? msg}`;
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Network error — check your connection and try again.';
  return msg;
}

export function isDuplicateExpenseError(err: unknown): boolean {
  const e = err as { message?: string } | null;
  return Boolean(e?.message?.startsWith('DUPLICATE_EXPENSE'));
}
