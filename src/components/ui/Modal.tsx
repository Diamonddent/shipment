import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" onSubmit={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="animate-fade absolute inset-0 bg-[#06122a]/55" onClick={onClose} />
      <div
        className={cn(
          'glass-strong animate-sheet relative flex max-h-[92vh] max-h-[92dvh] w-full min-w-0 flex-col rounded-t-3xl sm:animate-pop sm:rounded-3xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-4 dark:border-navy-700 sm:px-5">
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="lg-press -m-1 rounded-xl p-2 text-slate-500 hover:bg-white/60 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-w-0 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-navy-700 sm:px-5 sm:pb-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-accent-50 text-accent')}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          {message}
          {children}
        </div>
      </div>
    </Modal>
  );
}
