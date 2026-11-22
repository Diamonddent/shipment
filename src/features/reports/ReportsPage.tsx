import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, FileDown, FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Checkbox, ErrorState, Input, PageHeader, Select, Skeleton, useToast } from '@/components/ui';
import {
  useAllExpenses, useCategories, useForwarders, useSettings, useShipments, useSuppliers,
} from '@/hooks/queries';
import { useAuth, usePermissions } from '@/hooks/useAuth';
import { exportCSV, exportExcel, exportPDF, stamp, type ExportTable } from '@/lib/export';
import { errorMessage } from '@/lib/errors';
import { shipmentsService } from '@/services/shipments';
import { REPORTS, buildContext, filterLabels, type ReportData, type ReportDef, type ReportFilters } from './reportBuilders';
import { generateCostStatement } from './costStatement';

export default function ReportsPage() {
  const [params] = useSearchParams();
  const toast = useToast();
  const { profile } = useAuth();
  const perms = usePermissions();
  const shipments = useShipments(true);
  const expenses = useAllExpenses();
  const categories = useCategories();
  const suppliers = useSuppliers();
  const forwarders = useForwarders();
  const { settings } = useSettings();
  const [filters, setFilters] = useState<ReportFilters>({ shipmentId: params.get('shipment') ?? '' });
  const [stmtShipment, setStmtShipment] = useState(params.get('shipment') ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>(REPORTS[0].id);

  const queries = [shipments, expenses, categories, suppliers, forwarders];
  const loading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error;

  const data: ReportData | null = useMemo(
    () =>
      loading || error
        ? null
        : {
            shipments: shipments.data ?? [], expenses: expenses.data ?? [],
            categories: categories.data ?? [], suppliers: suppliers.data ?? [], forwarders: forwarders.data ?? [], includeLineVat: settings.includeLineVat,
          },
    [loading, error, shipments.data, expenses.data, categories.data, suppliers.data, forwarders.data, settings.includeLineVat],
  );
  const ctx = useMemo(() => (data ? buildContext(data, filters) : null), [data, filters]);

  const run = async (r: ReportDef, kind: 'xlsx' | 'csv' | 'pdf') => {
    if (!ctx || !data) return;
    setBusy(`${r.id}-${kind}`);
    try {
      const tables = r.build(ctx);
      const name = `${r.title.replace(/[^A-Za-z]+/g, '-')}_${stamp()}`;
      const meta = { title: r.title, subtitle: settings.companyName, filters: filterLabels(filters, data), companyName: settings.companyName, companyAddress: settings.companyAddress };
      if (kind === 'xlsx') await exportExcel(name, tables, meta);
      else if (kind === 'csv') tables.forEach((t: ExportTable, i) => exportCSV(tables.length > 1 ? `${name}_${i + 1}-${t.name.replace(/\s+/g, '-')}` : name, t));
      else await exportPDF(name, tables, meta, r.orientation);
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const statement = async () => {
    const s = shipments.data?.find((x) => x.id === stmtShipment);
    if (!s || !data) return;
    setBusy('statement');
    try {
      await generateCostStatement({
        shipment: s,
        expenses: data.expenses.filter((e) => e.shipment_id === s.id),
        categories: data.categories,
        includeLineVat: settings.includeLineVat,
        companyName: settings.companyName,
        companyAddress: settings.companyAddress,
        preparedBy: profile?.full_name,
      });
      if (perms.canEditShipment(s)) await shipmentsService.markExported(s.id).catch(() => undefined);
    } catch (e) {
      toast.error('Could not create the statement', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const previewReport = REPORTS.find((r) => r.id === preview)!;
  const previewTable = ctx ? previewReport.build(ctx)[0] : null;

  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="All figures in SAR, calculated from live records. Export to Excel, CSV or PDF." />
      <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-slate-500">From (invoice date)<Input type="date" className="mt-1" value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} /></label>
        <label className="text-xs text-slate-500">To<Input type="date" className="mt-1" value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} /></label>
        <label className="text-xs text-slate-500">Supplier
          <Select className="mt-1" value={filters.supplierId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, supplierId: e.target.value }))}>
            <option value="">All suppliers</option>
            {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </label>
        <label className="text-xs text-slate-500">Shipment
          <Select className="mt-1" value={filters.shipmentId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, shipmentId: e.target.value }))}>
            <option value="">All shipments</option>
            {(shipments.data ?? []).filter((s) => !s.is_archived).map((s) => <option key={s.id} value={s.id}>{s.shipment_code} · {s.po_number ?? ''}</option>)}
          </Select>
        </label>
        <div className="flex items-end pb-2"><Checkbox label="Include cancelled" checked={!!filters.includeCancelled} onChange={(e) => setFilters((f) => ({ ...f, includeCancelled: e.target.checked }))} /></div>
      </Card>

      {error ? <Card><ErrorState error={error} /></Card> : (
        <>
          <Card className="mb-6 border-accent-100 bg-gradient-to-r from-white to-accent-50/60 dark:from-navy-900 dark:to-navy-800">
            <CardBody className="flex flex-wrap items-end gap-4">
              <div className="min-w-[240px] flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><FileText className="h-4 w-4 text-accent" /> Shipment Cost Statement (management review)</p>
                <p className="mt-0.5 text-xs text-slate-500">Company header, shipment details, each expense as % of supplier invoice, payment status and sign-off lines.</p>
              </div>
              <Select className="w-72" value={stmtShipment} onChange={(e) => setStmtShipment(e.target.value)} aria-label="Shipment for statement">
                <option value="">Select shipment…</option>
                {(shipments.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.shipment_code} · {s.po_number ?? ''} · {s.supplier?.name ?? ''}</option>)}
              </Select>
              <Button icon={<FileDown className="h-4 w-4" />} disabled={!stmtShipment || loading} loading={busy === 'statement'} onClick={() => void statement()}>Download PDF</Button>
            </CardBody>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {REPORTS.map((r) => (
              <Card key={r.id} className={`flex flex-col ${preview === r.id ? 'ring-2 ring-accent/40' : ''}`}>
                <div className="flex-1 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent dark:bg-navy-800"><BarChart3 className="h-4 w-4" /></div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{r.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{r.description}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 dark:border-navy-700">
                  <Button size="sm" variant="ghost" onClick={() => setPreview(r.id)} disabled={loading}>Preview</Button>
                  <span className="flex-1" />
                  <Button size="sm" variant="outline" icon={<FileSpreadsheet className="h-3.5 w-3.5" />} disabled={loading} loading={busy === `${r.id}-xlsx`} onClick={() => void run(r, 'xlsx')}>Excel</Button>
                  <Button size="sm" variant="outline" icon={<Sheet className="h-3.5 w-3.5" />} disabled={loading} loading={busy === `${r.id}-csv`} onClick={() => void run(r, 'csv')}>CSV</Button>
                  <Button size="sm" variant="outline" icon={<FileText className="h-3.5 w-3.5" />} disabled={loading} loading={busy === `${r.id}-pdf`} onClick={() => void run(r, 'pdf')}>PDF</Button>
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-6">
            <CardHeader title={`Preview — ${previewReport.title}`} subtitle={ctx ? `${ctx.shipments.length} shipment(s) in selection` : ''} />
            {loading || !previewTable ? <div className="p-5"><Skeleton className="h-40" /></div> : previewTable.rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">No records match the selected filters.</p>
            ) : (
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-navy-800">
                    <tr>{previewTable.columns.map((c) => <th key={c.key} className={`whitespace-nowrap px-3 py-2 font-semibold text-slate-500 ${c.format && c.format !== 'text' && c.format !== 'date' ? 'text-right' : 'text-left'}`}>{c.header}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-navy-700">
                    {previewTable.rows.slice(0, 100).map((row, i) => (
                      <tr key={i}>
                        {previewTable.columns.map((c) => {
                          const v = (row as Record<string, unknown>)[c.key];
                          const num = c.format && c.format !== 'text' && c.format !== 'date';
                          return <td key={c.key} className={`whitespace-nowrap px-3 py-1.5 ${num ? 'text-right' : ''}`}>{v === null || v === undefined || v === '' ? '—' : c.format === 'money' ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : c.format === 'pct' ? `${Number(v).toFixed(2)}%` : String(v)}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {previewTable.totals && (
                    <tfoot className="bg-slate-50 font-semibold dark:bg-navy-800">
                      <tr>{previewTable.columns.map((c) => { const v = previewTable.totals?.[c.key]; return <td key={c.key} className={`whitespace-nowrap px-3 py-2 ${c.format && c.format !== 'text' && c.format !== 'date' ? 'text-right' : ''}`}>{v === undefined ? '' : c.format === 'money' ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v)}</td>; })}</tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
