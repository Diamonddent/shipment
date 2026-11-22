import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardHeader, EmptyState } from '@/components/ui';
import type { ShipmentCostAnalysis } from '@/lib/calculations';
import { fmtAmount, fmtMoney, fmtPct } from '@/lib/format';

export const CHART_COLORS = ['#1E3A8A', '#2563EB', '#0EA5E9', '#14B8A6', '#F59E0B', '#8B5CF6', '#EC4899', '#64748B', '#10B981', '#EF4444', '#A855F7', '#F97316', '#06B6D4', '#84CC16', '#6366F1'];

/**
 * Key metric: each expense and the total expenses as a % of the supplier invoice value.
 * % of supplier invoice = expense ÷ supplier invoice × 100.
 */
export function CostAnalysisPanel({ analysis, showExclVat = true }: { analysis: ShipmentCostAnalysis; showExclVat?: boolean }) {
  if (analysis.expenseCount === 0)
    return (
      <Card>
        <EmptyState title="No expenses yet" message="Enter the supplier invoice and other expenses to see the cost analysis." />
      </Card>
    );
  const expenseRows = analysis.byCategory.filter((r) => r.group !== 'product_invoice');
  const noInvoice = analysis.productInvoiceValue <= 0;
  const metrics = [
    { label: 'Supplier invoice value', value: fmtMoney(analysis.productInvoiceValue) },
    { label: 'Total expenses', value: fmtMoney(analysis.additionalExpenseTotal), hint: 'All costs except the supplier invoice' },
    { label: 'Expenses % of supplier invoice', value: fmtPct(analysis.additionalExpensePercentage), hint: 'Total expenses ÷ supplier invoice × 100', strong: true },
    { label: 'Total landed cost', value: fmtMoney(analysis.totalLandedCost), hint: 'Supplier invoice + expenses' },
  ];
  return (
    <div className="grid gap-5 2xl:grid-cols-5">
      <Card className="2xl:col-span-3">
        <CardHeader title="Expenses vs supplier invoice" subtitle="% of supplier invoice = expense ÷ supplier invoice value × 100" />
        {noInvoice && <p className="mx-5 mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">Enter the Supplier Invoice expense to calculate percentages.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-navy-700 dark:bg-navy-800/60">
                <th className="px-5 py-2.5 text-left">Expense</th>
                <th className="px-5 py-2.5 text-right">Amount SAR</th>
                <th className="px-5 py-2.5 text-right">% of supplier invoice</th>
                <th className="hidden w-40 px-5 py-2.5 sm:table-cell" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-navy-700">
              <tr className="bg-slate-50/50 dark:bg-navy-800/30">
                <td className="px-5 py-2.5 font-medium">Supplier invoice value</td>
                <td className="px-5 py-2.5 text-right font-medium">{fmtAmount(analysis.productInvoiceValue)}</td>
                <td className="px-5 py-2.5 text-right text-slate-400">base</td>
                <td className="hidden sm:table-cell" />
              </tr>
              {expenseRows.map((r, i) => (
                <tr key={r.key}>
                  <td className="px-5 py-2.5">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    {r.label}
                  </td>
                  <td className="px-5 py-2.5 text-right">{fmtAmount(r.amount)}</td>
                  <td className="px-5 py-2.5 text-right font-medium">{fmtPct(r.pctOfInvoice)}</td>
                  <td className="hidden px-5 sm:table-cell">
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-navy-800">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, r.pctOfInvoice ?? 0)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-slate-50 font-semibold dark:border-navy-700 dark:bg-navy-800/60">
                <td className="px-5 py-3">Total expenses</td>
                <td className="px-5 py-3 text-right">{fmtAmount(analysis.additionalExpenseTotal)}</td>
                <td className="px-5 py-3 text-right text-accent">{fmtPct(analysis.additionalExpensePercentage)}</td>
                <td className="hidden sm:table-cell" />
              </tr>
              <tr className="bg-slate-50 text-slate-600 dark:bg-navy-800/60 dark:text-slate-300">
                <td className="px-5 py-2.5">Total landed cost</td>
                <td className="px-5 py-2.5 text-right">{fmtAmount(analysis.totalLandedCost)}</td>
                <td className="px-5 py-2.5 text-right">{noInvoice ? '—' : fmtPct(100 + (analysis.additionalExpensePercentage ?? 0))}</td>
                <td className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-slate-500 dark:border-navy-700">
          {showExclVat && <>Landed cost excl. recoverable VAT: <b className="text-slate-700 dark:text-slate-200">{fmtMoney(analysis.landedCostExclRecoverableVat)}</b> · </>}
          VAT on service invoices: <b className="text-slate-700 dark:text-slate-200">{fmtMoney(analysis.lineVat)}</b> {analysis.lineVatIncluded ? '(included above)' : '(reported separately)'}
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2 2xl:col-span-2 2xl:grid-cols-1">
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((m) => (
            <Card key={m.label} className={m.strong ? 'border-accent/40 p-4' : 'p-4'}>
              <p className="text-xs text-slate-500">{m.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${m.strong ? 'text-accent' : 'text-slate-900 dark:text-white'}`}>{m.value}</p>
              {m.hint && <p className="mt-0.5 text-[11px] text-slate-400">{m.hint}</p>}
            </Card>
          ))}
        </div>
        <Card className="p-4">
          <p className="mb-2 text-xs font-medium text-slate-500">Expense split</p>
          <div className="h-56">
            {expenseRows.length === 0 ? (
              <p className="pt-20 text-center text-sm text-slate-400">No expenses besides the supplier invoice yet.</p>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie isAnimationActive={false} data={expenseRows} dataKey="amount" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={1}>
                    {expenseRows.map((r, i) => <Cell key={r.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${fmtMoney(v)}${noInvoice ? '' : ` (${fmtPct((v / analysis.productInvoiceValue) * 100)} of invoice)`}`, n]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
