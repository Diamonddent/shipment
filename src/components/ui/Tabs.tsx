import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
  const wrap = useRef<HTMLDivElement>(null);
  const [hl, setHl] = useState<{ x: number; w: number; h: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (el) setHl({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value, tabs.length]);
  return (
    <div className="mb-5 max-w-full overflow-x-auto [scrollbar-width:none]">
      <div ref={wrap} role="tablist" className="glass relative inline-flex min-w-max gap-1 rounded-2xl p-1">
        {hl && (
          <span
            className="lg-nav-hl"
            style={{ width: hl.w, height: hl.h, transform: `translate(${hl.x}px, ${hl.y}px)`, borderRadius: 12 }}
            aria-hidden="true"
          />
        )}
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              'lg-press relative z-[1] flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium',
              value === t.value ? 'text-slate-900 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-black/5 px-1.5 text-[11px] text-slate-700 dark:bg-white/10 dark:text-slate-200">{t.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
