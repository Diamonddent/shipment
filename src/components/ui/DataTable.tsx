import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
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

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-navy-700 dark:bg-navy-800/60 dark:text-slate-400">
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
                className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-accent-50/50 dark:hover:bg-navy-800/60')}
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
              <tr className="border-t-2 border-line bg-slate-50 font-semibold dark:border-navy-700 dark:bg-navy-800/60">
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
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-slate-500 dark:border-navy-700">
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
    </div>
  );
}
