import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Copy, Download, Eye, MoreHorizontal, Plus, Ship } from 'lucide-react';
import {
  Button, Card, Checkbox, ConfirmDialog, DataTable, DemoBadge, Dropdown, EmptyState, ErrorState, Input, PageHeader, SearchInput, Select, ShipmentStatusPill, TableSkeleton, useToast, type Column,
} from '@/components/ui';
import { qk, toCalcExpense, useAllExpenses, useSettings, useShipments, useSuppliers } from '@/hooks/queries';
import { usePermissions } from '@/hooks/useAuth';
import { shipmentsService } from '@/services/shipments';
import { analyzeShipmentCost, type ShipmentCostAnalysis } from '@/lib/calculations';
import { SHIPMENT_STATUSES, SHIPMENT_STATUS_LABEL, SHIPPING_METHOD_LABEL } from '@/lib/constants';
import { fmtAmount, fmtDate, fmtPct } from '@/lib/format';
import { inRange } from '@/lib/utils';
import { exportCSV, exportExcel, exportPDF, stamp, type ExportTable } from '@/lib/export';
import type { ShipmentWithRefs } from '@/types/database';

export default function ShipmentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const perms = usePermissions();
  const [showArchived, setShowArchived] = useState(false);
  const shipments = useShipments(true);
  const expenses = useAllExpenses();
  const suppliers = useSuppliers();
  const { settings } = useSettings();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [country, setCountry] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'archive' | 'restore' | 'duplicate'; s: ShipmentWithRefs } | null>(null);

  useEffect(() => {
    const pq = params.get('q');
    if (pq !== null) setQ(pq);
  }, [params]);

  const analyses = useMemo(() => {
    const m = new Map<string, ShipmentCostAnalysis>();
    const by = new Map<string, ReturnType<typeof toCalcExpense>[]>();
    (expenses.data ?? []).forEach((e) => {
      const arr = by.get(e.shipment_id) ?? [];
      arr.push(toCalcExpense(e));
      by.set(e.shipment_id, arr);
    });
    (shipments.data ?? []).forEach((s) => m.set(s.id, analyzeShipmentCost(by.get(s.id) ?? [], { includeLineVat: settings.includeLineVat })));
    return m;
  }, [expenses.data, shipments.data, settings.includeLineVat]);

  const countries = useMemo(() => [...new Set((shipments.data ?? []).map((s) => s.country_of_origin).filter(Boolean) as string[])].sort(), [shipments.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (shipments.data ?? []).filter((s) => {
      if (!showArchived && s.is_archived) return false;
      if (supplier && s.supplier_id !== supplier) return false;
      if (status && s.status !== status) return false;
      if (country && s.country_of_origin !== country) return false;
      if (!inRange(s.supplier_invoice_date ?? s.created_at, from, to)) return false;
      if (needle) {
        const hay = [s.shipment_code, s.po_number, s.reference_no, s.supplier_invoice_no, s.awb_bl_no, s.supplier?.name, s.forwarder?.name, s.country_of_origin].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [shipments.data, q, supplier, status, country, from, to, showArchived]);

  const act = useMutation({
    mutationFn: ({ kind, s }: { kind: 'archive' | 'restore' | 'duplicate'; s: ShipmentWithRefs }) =>
      kind === 'duplicate' ? shipmentsService.duplicate(s) : shipmentsService.archive(s.id, kind === 'archive'),
    onSuccess: (res, { kind }) => {
      qc.invalidateQueries({ queryKey: qk.shipments });
      qc.invalidateQueries({ queryKey: qk.shipmentsAll });
      setConfirm(null);
      if (kind === 'duplicate') {
        toast.success(`Duplicated as ${res.shipment_code}`);
        navigate(`/shipments/${res.id}`);
      } else toast.success(kind === 'archive' ? 'Shipment archived' : 'Shipment restored');
    },
    onError: (e) => toast.error('Action failed', e),
  });

  const columns: Column<ShipmentWithRefs>[] = [
    {
      key: 'code',
      header: 'Shipment',
      sortValue: (s) => s.shipment_code,
      cell: (s) => (
        <div className="min-w-[140px]">
          <p className="whitespace-nowrap font-semibold text-slate-900 dark:text-white">{s.shipment_code} <DemoBadge show={s.is_demo} /></p>
          <p className="text-xs text-slate-500">PO {s.po_number ?? '—'}{s.is_archived ? ' · archived' : ''}</p>
        </div>
      ),
    },
    { key: 'supplier', header: 'Supplier', sortValue: (s) => s.supplier?.name ?? '', cell: (s) => <div className="max-w-[220px]"><p className="truncate">{s.supplier?.name ?? '—'}</p><p className="truncate text-xs text-slate-500">{s.supplier_invoice_no ?? 'No invoice no.'}</p></div> },
    { key: 'country', header: 'Origin', hideBelow: 'md', sortValue: (s) => s.country_of_origin ?? '', cell: (s) => <div><p>{s.country_of_origin ?? '—'}</p><p className="text-xs text-slate-500">{s.shipping_method ? SHIPPING_METHOD_LABEL[s.shipping_method] : ''}</p></div> },
    { key: 'date', header: 'Invoice date', hideBelow: 'lg', sortValue: (s) => s.supplier_invoice_date ?? '', cell: (s) => <span className="whitespace-nowrap">{fmtDate(s.supplier_invoice_date)}</span> },
    { key: 'eta', header: 'Arrival', hideBelow: 'lg', sortValue: (s) => s.actual_arrival_date ?? s.expected_arrival_date ?? '', cell: (s) => <div><p className="whitespace-nowrap">{fmtDate(s.actual_arrival_date ?? s.expected_arrival_date)}</p><p className="text-xs text-slate-500">{s.actual_arrival_date ? 'actual' : s.expected_arrival_date ? 'expected' : ''}</p></div> },
    { key: 'landed', header: 'Landed cost SAR', align: 'right', sortValue: (s) => analyses.get(s.id)?.totalLandedCost ?? 0, cell: (s) => <span className="font-semibold">{fmtAmount(analyses.get(s.id)?.totalLandedCost ?? 0)}</span> },
    { key: 'pct', header: 'Add. %', align: 'right', hideBelow: 'md', sortValue: (s) => analyses.get(s.id)?.additionalExpensePercentage ?? -1, cell: (s) => fmtPct(analyses.get(s.id)?.additionalExpensePercentage) },
    { key: 'status', header: 'Status', sortValue: (s) => s.status, cell: (s) => <ShipmentStatusPill status={s.status} /> },
    {
      key: 'a',
      header: '',
      align: 'right',
      cell: (s) => (
        <Dropdown
          trigger={<button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-navy-800" aria-label="Shipment actions"><MoreHorizontal className="h-4 w-4" /></button>}
          items={[
            { label: 'Open details', icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/shipments/${s.id}`) },
            { label: 'Duplicate', icon: <Copy className="h-4 w-4" />, onClick: () => setConfirm({ kind: 'duplicate', s }) },
            { label: 'Archive', icon: <Archive className="h-4 w-4" />, onClick: () => setConfirm({ kind: 'archive', s }), hidden: s.is_archived || !perms.canEditShipment(s), danger: true },
            { label: 'Restore', icon: <ArchiveRestore className="h-4 w-4" />, onClick: () => setConfirm({ kind: 'restore', s }), hidden: !s.is_archived || !perms.canEditShipment(s) },
          ]}
        />
      ),
    },
  ];

  const table = (): ExportTable => ({
    name: 'Shipments',
    columns: [
      { header: 'Shipment ID', key: 'code' }, { header: 'PO', key: 'po' }, { header: 'Reference', key: 'ref' }, { header: 'Supplier', key: 'supplier', width: 28 },
      { header: 'Supplier Invoice', key: 'inv' }, { header: 'Invoice Date', key: 'invDate', format: 'date' }, { header: 'Origin', key: 'country' }, { header: 'Method', key: 'method' },
      { header: 'Forwarder', key: 'ff', width: 24 }, { header: 'AWB/BL', key: 'awb' }, { header: 'Currency', key: 'cur' }, { header: 'Rate', key: 'rate', format: 'rate' },
      { header: 'Status', key: 'status' }, { header: 'Product Invoice SAR', key: 'pi', format: 'money' }, { header: 'Landed Cost SAR', key: 'landed', format: 'money' }, { header: 'Additional %', key: 'pct', format: 'pct' },
    ],
    rows: filtered.map((s) => {
      const a = analyses.get(s.id);
      return {
        code: s.shipment_code, po: s.po_number ?? '', ref: s.reference_no ?? '', supplier: s.supplier?.name ?? '', inv: s.supplier_invoice_no ?? '', invDate: s.supplier_invoice_date,
        country: s.country_of_origin ?? '', method: s.shipping_method ? SHIPPING_METHOD_LABEL[s.shipping_method] : '', ff: s.forwarder?.name ?? '', awb: s.awb_bl_no ?? '',
        cur: s.currency_code, rate: Number(s.exchange_rate), status: SHIPMENT_STATUS_LABEL[s.status], pi: a?.productInvoiceValue ?? 0, landed: a?.totalLandedCost ?? 0, pct: a?.additionalExpensePercentage ?? '',
      };
    }),
  });
  const meta = { title: 'Shipment Register', filters: [`${filtered.length} shipments`, from || to ? `Period ${from || '…'} – ${to || '…'}` : 'All dates'] };

  return (
    <div>
      <PageHeader
        title="Shipment Register"
        subtitle="All import shipments with their landed cost in SAR"
        actions={
          <>
            <Dropdown
              trigger={<Button variant="outline" icon={<Download className="h-4 w-4" />} disabled={!filtered.length}>Export</Button>}
              items={[
                { label: 'Excel (.xlsx)', onClick: () => void exportExcel(`Shipments_${stamp()}`, [table()], meta) },
                { label: 'CSV', onClick: () => exportCSV(`Shipments_${stamp()}`, table()) },
                { label: 'PDF', onClick: () => void exportPDF(`Shipments_${stamp()}`, [table()], meta) },
              ]}
            />
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/shipments/new')}>New shipment</Button>
          </>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 dark:border-navy-700 sm:grid-cols-2 lg:grid-cols-7">
          <SearchInput value={q} onChange={(v) => { setQ(v); if (params.get('q')) setParams({}, { replace: true }); }} placeholder="Shipment ID, PO, invoice, AWB…" className="lg:col-span-2" />
          <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier">
            <option value="">All suppliers</option>
            {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {SHIPMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" title="Invoice date from" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" title="Invoice date to" />
          </div>
          <Checkbox label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        </div>
        {shipments.isLoading ? (
          <TableSkeleton />
        ) : shipments.isError ? (
          <ErrorState error={shipments.error} onRetry={() => shipments.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(s) => s.id}
            onRowClick={(s) => navigate(`/shipments/${s.id}`)}
            initialSort={{ key: 'code', dir: 'desc' }}
            empty={
              <EmptyState
                icon={<Ship className="h-6 w-6" />}
                title={shipments.data?.length ? 'No shipments match your filters' : 'No shipments yet'}
                message={shipments.data?.length ? 'Clear a filter or search term.' : 'Create your first shipment with the guided workflow.'}
                action={!shipments.data?.length && <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/shipments/new')}>New shipment</Button>}
              />
            }
          />
        )}
      </Card>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && act.mutate(confirm)}
        loading={act.isPending}
        tone={confirm?.kind === 'archive' ? 'danger' : 'primary'}
        title={confirm?.kind === 'archive' ? 'Archive shipment?' : confirm?.kind === 'restore' ? 'Restore shipment?' : 'Duplicate shipment?'}
        confirmLabel={confirm?.kind === 'archive' ? 'Archive' : confirm?.kind === 'restore' ? 'Restore' : 'Duplicate'}
        message={
          confirm?.kind === 'archive'
            ? `${confirm.s.shipment_code} will be hidden from the register and dashboard. Nothing is deleted.`
            : confirm?.kind === 'restore'
              ? `${confirm?.s.shipment_code} will be visible again.`
              : `A new Draft shipment is created from ${confirm?.s.shipment_code} (header only).`
        }
      />
    </div>
  );
}
