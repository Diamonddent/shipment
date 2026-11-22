const sarFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

export function fmtMoney(v: number | null | undefined, currency = 'SAR'): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return `${currency} ${sarFmt.format(Number(v))}`;
}

export function fmtAmount(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return sarFmt.format(Number(v));
}

export function fmtCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return intFmt.format(v);
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return intFmt.format(Number(v));
}

export function fmtNum(v: number | null | undefined, maxDecimals = 3): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  if (maxDecimals === 3) return numFmt.format(Number(v));
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxDecimals }).format(Number(v));
}

export function fmtRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(Number(v));
}

export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return `${Number(v).toFixed(decimals)}%`;
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}
