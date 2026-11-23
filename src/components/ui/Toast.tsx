import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}
interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, err?: unknown) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = ++counter;
      setItems((xs) => [...xs.slice(-3), { id, kind, title, message }]);
      setTimeout(() => remove(id), kind === 'error' ? 8000 : 4000);
    },
    [remove],
  );
  const api: ToastApi = {
    success: (t, m) => push('success', t, m),
    error: (t, err) => push('error', t, err === undefined ? undefined : errorMessage(err)),
    info: (t, m) => push('info', t, m),
  };
  const icons = {
    success: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />,
    error: <XCircle className="h-5 w-5 shrink-0 text-red-500" />,
    info: <Info className="h-5 w-5 text-accent" />,
  };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-[calc(92px+env(safe-area-inset-bottom))] right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 md:bottom-4">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn('glass-strong animate-pop pointer-events-auto flex gap-3 rounded-2xl p-3.5')}
          >
            {icons[t.kind]}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-white">{t.title}</p>
              {t.message && <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">{t.message}</p>}
            </div>
            <button onClick={() => remove(t.id)} className="text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
