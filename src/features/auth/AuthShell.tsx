import type { ReactNode } from 'react';
import { APP_TITLE, COMPANY_NAME } from '@/lib/constants';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.35),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(30,58,138,0.6),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M6 3h12l4 6-10 12L2 9z" />
                <path d="M2 9h20M12 21 8 9l4-6 4 6z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold tracking-wider">{COMPANY_NAME}</p>
              <p className="text-xs text-slate-300">Medical &amp; Dental Supplies</p>
            </div>
          </div>
          <div>
            <h1 className="max-w-md text-4xl font-semibold leading-tight">{APP_TITLE}</h1>
            <p className="mt-4 max-w-md text-slate-300">
              Track every import cost — supplier invoices, freight, customs duty, VAT and clearance — and know the true landed cost of every shipment and product.
            </p>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-3 text-center">
              {['Landed cost', 'Per-unit cost', 'Audit trail'].map((t) => (
                <div key={t} className="rounded-xl bg-white/5 px-3 py-4 text-xs text-slate-200 ring-1 ring-white/10">
                  {t}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} {COMPANY_NAME}</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-surface px-6 py-12 dark:bg-navy-950">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-bold tracking-wider text-primary dark:text-white">{COMPANY_NAME}</p>
            <p className="text-xs text-slate-500">{APP_TITLE}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
