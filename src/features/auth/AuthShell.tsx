import type { ReactNode } from 'react';
import { APP_TITLE, COMPANY_NAME } from '@/lib/constants';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-10">
      <div className="relative hidden min-w-0 lg:block">
        <div className="relative flex h-full flex-col justify-between p-6 text-slate-900 dark:text-white xl:p-10">
          <div className="lg-rise flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#3557d4] bg-gradient-to-br from-[#3557d4] to-[#6b3fd1] text-white shadow-lg">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M6 3h12l4 6-10 12L2 9z" />
                <path d="M2 9h20M12 21 8 9l4-6 4 6z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold tracking-wider">{COMPANY_NAME}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">Medical &amp; Dental Supplies</p>
            </div>
          </div>
          <div className="lg-rise" style={{ ['--i' as string]: 1 }}>
            <h1 className="max-w-md text-[clamp(28px,3vw,40px)] font-semibold leading-tight tracking-tight">{APP_TITLE}</h1>
            <p className="mt-4 max-w-md text-slate-600 dark:text-slate-300">
              Track every import cost — supplier invoices, freight, customs duty, VAT and clearance — and see every expense as a % of the supplier invoice.
            </p>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-3 text-center">
              {['Expense % of invoice', 'Drive attachments', 'Audit trail'].map((t) => (
                <div key={t} className="glass rounded-2xl px-3 py-4 text-xs text-slate-700 dark:text-slate-200">
                  {t}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">© {new Date().getFullYear()} {COMPANY_NAME}</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-center">
        <div className="glass lg-rise w-full max-w-md rounded-3xl p-6 sm:p-8" style={{ ['--i' as string]: 2 }}>
          <div className="mb-8 lg:hidden">
            <p className="break-words text-sm font-bold tracking-wider text-slate-900 dark:text-white">{COMPANY_NAME}</p>
            <p className="text-xs text-slate-500">{APP_TITLE}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
