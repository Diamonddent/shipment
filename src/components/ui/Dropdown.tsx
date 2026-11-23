import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

export function Dropdown({ trigger, items, align = 'right' }: { trigger: ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;
  return (
    <div className="relative" ref={ref} data-menu-open={open ? 'true' : undefined} onClick={(e) => e.stopPropagation()}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'glass-strong animate-pop absolute z-40 mt-1 min-w-[190px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl py-1.5',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {visible.map((item, i) => (
            <button
              key={i}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                'mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40 sm:py-2',
                item.danger ? 'text-red-700 hover:bg-red-500/10 dark:text-red-300' : 'text-slate-700 hover:bg-white/70 dark:text-slate-100 dark:hover:bg-white/10',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
