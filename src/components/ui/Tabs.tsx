import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="-mx-1 mb-5 overflow-x-auto">
      <div className="flex min-w-max gap-1 border-b border-line px-1 dark:border-navy-700">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition',
              value === t.value
                ? 'border-accent text-primary dark:text-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600 dark:bg-navy-800 dark:text-slate-300">{t.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
