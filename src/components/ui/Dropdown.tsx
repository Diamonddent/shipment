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
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute z-40 mt-1 min-w-[190px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-pop animate-fadein dark:border-navy-700 dark:bg-navy-900',
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
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-40',
                item.danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-navy-800',
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
