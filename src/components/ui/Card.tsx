import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CountUp } from './CountUp';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass lg-rise min-w-0 rounded-3xl', className)} {...rest} />;
}

export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 dark:border-navy-700 sm:px-5', className)}>
      <div className="min-w-0">
        <h3 className="break-words text-[clamp(14px,1.2vw,16px)] font-semibold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 sm:p-5', className)} {...rest} />;
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = 'blue',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'violet';
}) {
  const tones = {
    blue: 'bg-accent-50 text-accent dark:bg-[#4f7cff]/20 dark:text-[#b9cbff]',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-400/15 dark:text-red-300',
    slate: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
  };
  const animatable = typeof value === 'string' || typeof value === 'number';
  return (
    <div className="glass glass-hover lg-rise min-w-0 rounded-3xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 break-words text-[clamp(18px,1.9vw,24px)] font-semibold tabular-nums text-slate-900 dark:text-white">
            {animatable ? <CountUp value={value as string | number} /> : value}
          </p>
          {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
        {icon && <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', tones[tone])}>{icon}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="lg-rise mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
      <div className="min-w-0">
        <h1 className="break-words text-[clamp(20px,2.4vw,30px)] font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
