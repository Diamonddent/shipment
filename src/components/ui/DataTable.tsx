import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PHONE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  className?: string;
  footer?: ReactNode;
  hideBelow?: 'sm' | 'md' | 'lg';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  pageSize = 25,
  initialSort,
  empty,
  showFooter,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  empty?: ReactNode;
  showFooter?: boolean;
  dense?: boolean;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const phone = useMediaQuery(PHONE_QUERY);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va === vb) return 0;
      if (va === null || va === undefined || va === '') return 1;
      if (vb === null || vb === undefined || vb === '') return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

  if (rows.length === 0 && empty) return <>{empty}</>;

  const pager = (
    <>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-slate-500 dark:border-navy-700">
          <span>
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (phone) {
    // Phones: same rows, sorting, actions and totals rendered as stacked glass cards.
    const sortable = columns.filter((c) => c.sortValue);
    const isActions = (c: Column<T>) => c.key === 'actions' || c.header === '' || c.header === null || c.header === undefined;
    const [titleCol, ...restCols] = columns.filter((c) => !isActions(c));
    const actionCols = columns.filter(isActions);
    return (
      <div className="min-w-0">
        {sortable.length > 0 && (
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 text-xs text-slate-500 dark:border-navy-700">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0">Sort by</span>
              <select
                className="lg-field h-9 min-w-0 flex-1 rounded-xl px-2 text-sm"
                value={sort?.key ?? ''}
                onChange={(e) => setSort(e.target.value ? { key: e.target.value, dir: sort?.dir ?? 'asc' } : null)}
              >
                <option value="">Default</option>
                {sortable.map((c) => (
                  <option key={c.key} value={c.key}>
                    {typeof c.header === 'string' ? c.header : c.key}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="icon"
              variant="outline"
              disabled={!sort}
              aria-label={sort?.dir === 'desc' ? 'Sort ascending' : 'Sort descending'}
              onClick={() => sort && setSort({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
            >
              {sort?.dir === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        )}
        <ul className="lg-stagger space-y-2.5 p-2.5">
          {visible.map((r) => (
            <li
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn('glass-tile min-w-0 rounded-2xl px-3.5 py-2.5 text-sm', onRowClick && 'lg-press cursor-pointer active:bg-white/10')}
            >
              {titleCol && (
                <div className="flex min-w-0 items-start justify-between gap-2 border-b border-line pb-2 dark:border-navy-700">
                  <span className="sr-only">{titleCol.header}</span>
                  <div className="min-w-0 flex-1 break-words font-medium text-slate-900 [overflow-wrap:anywhere] dark:text-white">{titleCol.cell(r)}</div>
                </div>
              )}
              <dl className="divide-y divide-line dark:divide-navy-700">
                {restCols.map((c) => (
                  <div key={c.key} className="flex min-w-0 items-start justify-between gap-3 py-1.5">
                    <dt className="shrink-0 pt-0.5 text-xs text-slate-500 dark:text-slate-400">{c.header}</dt>
                    <dd className="min-w-0 break-words text-right text-slate-700 [overflow-wrap:anywhere] dark:text-slate-200 [&_*]:max-w-full">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
              {actionCols.length > 0 && (
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 border-t border-line pt-2 dark:border-navy-700" onClick={(e) => e.stopPropagation()}>
                  {actionCols.map((c) => (
                    <div key={c.key} className="min-w-0">
                      {c.cell(r)}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        {showFooter && (
          <div className="mx-2.5 mb-2.5 rounded-2xl border border-[var(--bd2)] bg-gradient-to-br from-[#4f7cff]/20 to-[#9a6bff]/15 px-3.5 py-2.5 text-sm font-semibold">
            <dl className="divide-y divide-line dark:divide-navy-700">
              {columns
                .filter((c) => c.footer !== undefined && c.footer !== null && c.footer !== '')
                .map((c) => (
                  <div key={c.key} className="flex min-w-0 items-start justify-between gap-3 py-1.5">
                    <dt className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">{c === titleCol ? 'Total' : c.header}</dt>
                    <dd className="min-w-0 break-words text-right">{c.footer}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
        {pager}
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-navy-700 dark:text-slate-400">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'whitespace-nowrap px-4 py-2.5',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.hideBelow && hide[c.hideBelow],
                    c.className,
                  )}
                >
                  {c.sortValue ? (
                    <button
                      className={cn('inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-white', c.align === 'right' && 'flex-row-reverse')}
                      onClick={() =>
                        setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }))
                      }
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line dark:divide-navy-700">
            {visible.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-white/50 dark:hover:bg-white/[0.06]')}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-4 text-slate-700 dark:text-slate-200',
                      dense ? 'py-2' : 'py-3',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.hideBelow && hide[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {showFooter && (
            <tfoot>
              <tr className="border-t-2 border-line bg-gradient-to-r from-[#4f7cff]/10 to-[#9a6bff]/10 font-semibold dark:border-navy-700">
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-2.5', c.align === 'right' && 'text-right', c.hideBelow && hide[c.hideBelow])}>
                    {c.footer}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {pager}
    </div>
  );
}
