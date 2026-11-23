import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import { Button } from './Button';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)}>
      <Loader2 className="h-5 w-5 animate-spin text-accent" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-white/50 dark:bg-white/[0.07]', className)} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, message, action, icon }: { title: string; message?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="glass-tile mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-slate-500 dark:text-slate-300">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      {message && <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load data' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">
        <AlertCircle className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'amber', title, children, className }: { tone?: 'amber' | 'red' | 'blue' | 'green'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const tones = {
    amber: 'border-amber-300/70 bg-amber-50/80 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100',
    red: 'border-red-300/70 bg-red-50/80 text-red-900 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100',
    blue: 'border-blue-300/70 bg-blue-50/80 text-blue-900 dark:border-[#4f7cff]/40 dark:bg-[#4f7cff]/10 dark:text-blue-100',
    green: 'border-emerald-300/70 bg-emerald-50/80 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100',
  };
  return (
    <div className={cn('min-w-0 break-words rounded-2xl border px-4 py-3 text-sm', tones[tone], className)}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && 'mt-1', 'text-[13px] opacity-90')}>{children}</div>}
    </div>
  );
}
