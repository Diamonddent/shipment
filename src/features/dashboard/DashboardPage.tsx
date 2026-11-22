import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, CheckCircle2, Clock, Coins, Landmark, Package, Percent, Plane, Plus, Receipt, Scale, Ship, Wallet,
} from 'lucide-react';
import { Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Input, KpiCard, PageHeader, Select, Skeleton } from '@/components/ui';
import { toCalcExpense, useAllExpenses, useAllShipmentProducts, useSettings, useShipments, useSuppliers } from '@/hooks/queries';
import { COST_GROUPS, COST_GROUP_LABELS, summarizePortfolio, sumMoney, type ShipmentForSummary } from '@/lib/calculations';
import { SHIPMENT_STATUSES } from '@/lib/constants';
import { fmtCompact, fmtMoney, fmtPct, monthKey, monthLabel } from '@/lib/format';
import { inRange } from '@/lib/utils';
import { shipmentWarnings } from '@/lib/warnings';
import { CHART_COLORS } from '@/features/shipments/CostAnalysisPanel';
import type { ExpenseWithRefs } from '@/types/database';

const tooltipStyle = { borderRadius: 10, border: '1px solid #E5E9F0', fontSize: 12 };

export default function DashboardPage() {
  const navigate = useNavigate();
  const shipments = useShipments();
  const expenses = useAllExpenses();
  const products = useAllShipmentProducts();
  const suppliers = useSuppliers();
  const { settings } = useSettings();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const expBy = useMemo(() => {
    const m = new Map<string, ExpenseWithRefs[]>();
    (expenses.data ?? []).forEach((e) => {
      const arr = m.get(e.shipment_id) ?? [];
      arr.push(e);
      m.set(e.shipment_id, arr);
    });
    return m;
  }, [expenses.data]);

  const filtered = useMemo(
    () =>
      (shipments.data ?? []).filter(
        (s) => (!supplier || s.supplier_id === supplier) && (!status || s.status === status) && inRange(s.supplier_invoice_date ?? s.created_at, from, to),
      ),
    [shipments.data, supplier, status, from, to],
  );

  const summary = useMemo(() => {
    const list: ShipmentForSummary[] = filtered.map((s) => ({ id: s.id, status: s.status, is_archived: s.is_archived, expenses: (expBy.get(s.id) ?? []).map(toCalcExpense) }));
    return summarizePortfolio(list, { includeLineVat: settings.includeLineVat, includeCancelled: includeCancelled || status === 'cancelled' });
  }, [filtered, expBy, settings.includeLineVat, includeCancelled, status]);

  const included = filtered.filter((s) => summary.perShipment.has(s.id));

  const distribution = COST_GROUPS.map((g) => ({ name: COST_GROUP_LABELS[g], value: summary.byGroup[g] })).filter((d) => d.value > 0);
  const monthly = useMemo(() => {
    const m = new Map<string, { month: string; invoice: number; additional: number; landed: number }>();
    for (const s of included) {
      const a = summary.perShipment.get(s.id)!;
      const k = monthKey(s.supplier_invoice_date ?? s.created_at);
      const cur = m.get(k) ?? { month: k, invoice: 0, additional: 0, landed: 0 };
      cur.invoice = sumMoney([cur.invoice, a.productInvoiceValue]);
      cur.additional = sumMoney([cur.additional, a.additionalExpenseTotal]);
      cur.landed = sumMoney([cur.landed, a.totalLandedCost]);
      m.set(k, cur);
    }
    return [...m.values()].sort((x, y) => x.month.localeCompare(y.month)).map((r) => ({ ...r, label: monthLabel(r.month) }));
  }, [included, summary]);
  const comparison = included
    .map((s) => {
      const a = summary.perShipment.get(s.id)!;
      return { name: s.shipment_code.replace(/^.*?(\d{4}-\d{4})$/, '$1'), full: s.shipment_code, invoice: a.productInvoiceValue, additional: a.additionalExpenseTotal, total: a.totalLandedCost };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
  const byCountry = useMemo(() => {
    const m = new Map<string, { country: string; shipments: number; landed: number }>();
    for (const s of included) {
      const c = s.supplier?.country || s.country_of_origin || 'Unknown';
      const cur = m.get(c) ?? { country: c, shipments: 0, landed: 0 };
      cur.shipments += 1;
      cur.landed = sumMoney([cur.landed, summary.perShipment.get(s.id)!.totalLandedCost]);
      m.set(c, cur);
    }
    return [...m.values()].sort((a, b) => b.shipments - a.shipments);
  }, [included, summary]);

  const warnings = useMemo(() => {
    const prodBy = new Map<string, NonNullable<typeof products.data>>();
    (products.data ?? []).forEach((p) => {
      const arr = prodBy.get(p.shipment_id) ?? [];
      arr.push(p);
      prodBy.set(p.shipment_id, arr);
    });
    return filtered
      .map((s) => ({ s, w: shipmentWarnings(s, expBy.get(s.id) ?? [], products.data ? prodBy.get(s.id) ?? [] : null).filter((x) => x.level !== 'info') }))
      .filter((x) => x.w.length > 0)
      .sort((a, b) => b.w.filter((x) => x.level === 'error').length - a.w.filter((x) => x.level === 'error').length);
  }, [filtered, expBy, products.data]);

  const loading = shipments.isLoading || expenses.isLoading;
  const error = shipments.error || expenses.error;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Import cost overview in SAR${includeCancelled ? ' (including cancelled shipments)' : ' — cancelled shipments excluded'}`}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/shipments/new')}>New shipment</Button>}
      />
      <Card className="mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-slate-500">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></label>
        <label className="text-xs text-slate-500">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" /></label>
        <label className="text-xs text-slate-500">Supplier
          <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="mt-1">
            <option value="">All suppliers</option>
            {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </label>
        <label className="text-xs text-slate-500">Status
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1">
            <option value="">All statuses</option>
            {SHIPMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </label>
        <div className="flex items-end pb-2"><Checkbox label="Include cancelled" checked={includeCancelled} onChange={(e) => setIncludeCancelled(e.target.checked)} /></div>
      </Card>

      {error ? (
        <Card><ErrorState error={error} onRetry={() => { shipments.refetch(); expenses.refetch(); }} /></Card>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (shipments.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={<Ship className="h-6 w-6" />} title="No shipments yet" message="Create your first shipment to start tracking landed costs. Every figure on this dashboard is calculated from your records." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/shipments/new')}>New shipment</Button>} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <KpiCard label="Total shipments" value={summary.totalShipments} icon={<Ship className="h-5 w-5" />} />
            <KpiCard label="Product invoice value" value={fmtMoney(summary.productInvoiceValue)} icon={<Package className="h-5 w-5" />} />
            <KpiCard label="Freight expenses" value={fmtMoney(summary.freight)} icon={<Plane className="h-5 w-5" />} tone="violet" />
            <KpiCard label="Customs duty" value={fmtMoney(summary.customsDuty)} icon={<Landmark className="h-5 w-5" />} tone="slate" />
            <KpiCard label="Total VAT" value={fmtMoney(summary.vat)} icon={<Receipt className="h-5 w-5" />} tone="slate" hint="Import VAT (recoverable)" />
            <KpiCard label="Additional expenses" value={fmtMoney(summary.additionalExpenses)} icon={<Coins className="h-5 w-5" />} tone="amber" />
            <KpiCard label="Total landed cost" value={fmtMoney(summary.totalLandedCost)} icon={<Scale className="h-5 w-5" />} />
            <KpiCard label="Avg. additional cost %" value={fmtPct(summary.averageAdditionalPct)} icon={<Percent className="h-5 w-5" />} tone="violet" hint={`Weighted: ${fmtPct(summary.weightedAdditionalPct)}`} />
            <KpiCard label="Pending shipments" value={summary.pendingShipments} icon={<Clock className="h-5 w-5" />} tone="amber" />
            <KpiCard label="Shipments completed" value={summary.completedShipments} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
            <KpiCard label="Unpaid expenses" value={summary.unpaidExpenseCount} icon={<Wallet className="h-5 w-5" />} tone="red" hint={`Outstanding ${fmtMoney(summary.unpaidExpenseAmount)}`} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Expense distribution" subtitle="Share of total landed cost" />
              <div className="h-72 p-4">
                {distribution.length === 0 ? <EmptyState title="No expenses in this selection" /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie isAnimationActive={false} data={distribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={1}>
                        {distribution.map((d, i) => <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${fmtMoney(v)} · ${fmtPct((v / summary.totalLandedCost) * 100)}`, n]} />
                      <Legend verticalAlign="bottom" align="center" layout="horizontal" iconType="circle" wrapperStyle={{ fontSize: 11 }}
                        formatter={(value: string, entry) => `${value} ${fmtPct(((entry.payload as unknown as { value: number }).value / summary.totalLandedCost) * 100, 1)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Monthly shipment expenses" subtitle="Product invoice vs additional expenses, with landed cost trend (by supplier invoice month)" />
              <div className="h-72 p-4">
                {monthly.length === 0 ? <EmptyState title="No data" /> : (
                  <ResponsiveContainer>
                    <ComposedChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={50} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar isAnimationActive={false} dataKey="invoice" name="Product invoice" stackId="a" fill="#1E3A8A" radius={[0, 0, 0, 0]} />
                      <Bar isAnimationActive={false} dataKey="additional" name="Additional expenses" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                      <Line isAnimationActive={false} dataKey="landed" name="Landed cost" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Shipment cost comparison" subtitle="Top shipments by landed cost" />
              <div className="h-72 p-4">
                {comparison.length === 0 ? <EmptyState title="No data" /> : (
                  <ResponsiveContainer>
                    <BarChart data={comparison} onClick={(e) => { const p = e?.activePayload?.[0]?.payload as { full?: string } | undefined; const s = included.find((x) => x.shipment_code === p?.full); if (s) navigate(`/shipments/${s.id}`); }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={50} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ''} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar isAnimationActive={false} dataKey="invoice" name="Product invoice" stackId="a" fill="#1E3A8A" cursor="pointer" />
                      <Bar isAnimationActive={false} dataKey="additional" name="Additional expenses" stackId="a" fill="#0EA5E9" radius={[4, 4, 0, 0]} cursor="pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Country of origin" subtitle="Shipment distribution by supplier country (hover for landed cost)" />
              <div className="h-72 p-4">
                {byCountry.length === 0 ? <EmptyState title="No data" /> : (
                  <ResponsiveContainer>
                    <BarChart data={byCountry} layout="vertical" margin={{ left: 10, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="country" tick={{ fontSize: 11 }} width={110} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: number, _n: string, item) => [`${v} shipment(s) · ${fmtMoney((item.payload as { landed: number }).landed)}`, 'Shipments · landed cost']}
                      />
                      <Bar isAnimationActive={false} dataKey="shipments" name="Shipments" radius={[0, 6, 6, 0]} barSize={22}>
                        {byCountry.map((c, i) => <Cell key={c.country} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader title="Warnings" subtitle="Missing invoices, exchange rates or expense information" actions={<span className="text-xs text-slate-500">{warnings.length} shipment(s)</span>} />
            {warnings.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />} title="No data warnings" message="All shipments in this selection have their key information." />
            ) : (
              <ul className="divide-y divide-line dark:divide-navy-700">
                {warnings.slice(0, 10).map(({ s, w }) => (
                  <li key={s.id}>
                    <Link to={`/shipments/${s.id}`} className="flex gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-navy-800">
                      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${w.some((x) => x.level === 'error') ? 'text-red-500' : 'text-amber-500'}`} />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-slate-900 dark:text-white">{s.shipment_code} <span className="font-normal text-slate-500">· {s.supplier?.name ?? 'No supplier'} · PO {s.po_number ?? '—'}</span></p>
                        <p className="text-xs text-slate-500">{w.map((x) => x.message).join(' · ')}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
