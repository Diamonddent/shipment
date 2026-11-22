import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function WorkflowStepper({ steps, current, onStepClick }: { steps: { label: string; done: boolean }[]; current: number; onStepClick?: (i: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-0">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center">
            <button
              type="button"
              disabled={!onStepClick}
              onClick={() => onStepClick?.(i)}
              className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-left', onStepClick && 'hover:bg-slate-50 dark:hover:bg-navy-800')}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2',
                  s.done
                    ? 'bg-emerald-500 text-white ring-emerald-500'
                    : i === current
                      ? 'bg-accent text-white ring-accent'
                      : 'bg-white text-slate-400 ring-line dark:bg-navy-900 dark:ring-navy-700',
                )}
              >
                {s.done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn('whitespace-nowrap text-xs font-medium', s.done ? 'text-slate-700 dark:text-slate-200' : i === current ? 'text-primary dark:text-white' : 'text-slate-400')}>
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && <span className={cn('mx-1 h-0.5 w-6', s.done ? 'bg-emerald-400' : 'bg-line dark:bg-navy-700')} />}
          </li>
        ))}
      </ol>
    </div>
  );
}
