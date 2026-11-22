import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Power, Trash2, Truck } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, DataTable, DemoBadge, Dropdown, EmptyState, ErrorState, PageHeader, SearchInput, TableSkeleton, useToast, type Column } from '@/components/ui';
import { qk, toCalcExpense, useAllExpenses, useSettings, useShipments, useForwarders } from '@/hooks/queries';
import { usePermissions } from '@/hooks/useAuth';
import { forwardersService } from '@/services/masterData';
import { analyzeShipmentCost, percentOf, sumMoney } from '@/lib/calculations';
import { fmtAmount, fmtPct } from '@/lib/format';
import type { FreightForwarder } from '@/types/database';
import { ForwarderFormModal } from './ForwarderFormModal';

export default function ForwardersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const perms = usePermissions();
  const forwarders = useForwarders();
  const shipments = useShipments();
  const expenses = useAllExpenses();
  const { settings } = useSettings();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<FreightForwarder | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<FreightForwarder | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; freight: number; invoice: number; additional: number }>();
    for (const s of shipments.data ?? []) {
      if (!s.forwarder_id || s.status === 'cancelled') continue;
      const a = analyzeShipmentCost((expenses.data ?? []).filter((e) => e.shipment_id === s.id).map(toCalcExpense), { includeLineVat: settings.includeLineVat });
      const c = m.get(s.forwarder_id) ?? { count: 0, freight: 0, invoice: 0, additional: 0 };
      m.set(s.forwarder_id, { count: c.count + 1, freight: sumMoney([c.freight, a.byGroup.freight]), invoice: sumMoney([c.invoice, a.productInvoiceValue]), additional: sumMoney([c.additional, a.additionalExpenseTotal]) });
    }
    return m;
  }, [shipments.data, expenses.data, settings.includeLineVat]);

  const rows = (forwarders.data ?? []).filter((f) => !q || [f.name, f.country, f.services, f.contact_person].join(' ').toLowerCase().includes(q.toLowerCase()));
  const toggle = useMutation({
    mutationFn: (f: FreightForwarder) => forwardersService.update(f.id, { is_active: !f.is_active }),
    onSuccess: (f) => { qc.invalidateQueries({ queryKey: qk.forwarders }); toast.success(f.is_active ? 'Activated' : 'Deactivated'); },
    onError: (e) => toast.error('Update failed', e),
  });
  const del = useMutation({
    mutationFn: (f: FreightForwarder) => forwardersService.remove(f.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.forwarders }); setDeleting(null); toast.success('Forwarder deleted'); },
    onError: (e) => { setDeleting(null); toast.error('Could not delete — it is used by shipments. Deactivate it instead.', e); },
  });

  const columns: Column<FreightForwarder>[] = [
    { key: 'name', header: 'Forwarder', sortValue: (f) => f.name, cell: (f) => <div className="min-w-[200px]"><p className="font-medium text-slate-900 dark:text-white">{f.name} <DemoBadge show={f.is_demo} /></p><p className="text-xs text-slate-500">{f.country ?? '—'} · {f.services ?? ''}</p></div> },
    { key: 'contact', header: 'Contact', hideBelow: 'md', cell: (f) => <div className="text-xs"><p>{f.contact_person ?? '—'}</p><p className="text-slate-500">{f.email ?? ''} {f.phone ?? ''}</p></div> },
    { key: 'count', header: 'Shipments', align: 'right', sortValue: (f) => stats.get(f.id)?.count ?? 0, cell: (f) => stats.get(f.id)?.count ?? 0 },
    { key: 'freight', header: 'Freight SAR', align: 'right', sortValue: (f) => stats.get(f.id)?.freight ?? 0, cell: (f) => fmtAmount(stats.get(f.id)?.freight ?? 0) },
    { key: 'avg', header: 'Avg freight / shipment', align: 'right', hideBelow: 'md', sortValue: (f) => { const s = stats.get(f.id); return s?.count ? s.freight / s.count : 0; }, cell: (f) => { const s = stats.get(f.id); return fmtAmount(s?.count ? s.freight / s.count : 0); } },
    { key: 'fpct', header: 'Freight % of invoice', align: 'right', hideBelow: 'lg', cell: (f) => { const s = stats.get(f.id); return s?.invoice ? fmtPct(percentOf(s.freight, s.invoice)) : '—'; } },
    { key: 'status', header: 'Status', cell: (f) => <Badge tone={f.is_active ? 'green' : 'slate'}>{f.is_active ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'a', header: '', align: 'right',
      cell: (f) => (
        <Dropdown
          trigger={<button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-800" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></button>}
          items={[
            { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => { setEditing(f); setOpen(true); }, hidden: !perms.canEditMaster(f.created_by) },
            { label: f.is_active ? 'Deactivate' : 'Activate', icon: <Power className="h-4 w-4" />, onClick: () => toggle.mutate(f), hidden: !perms.canEditMaster(f.created_by) },
            { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleting(f), danger: true, hidden: !perms.canDeleteMaster },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Freight Forwarders" subtitle="Logistics, courier and clearance partners — with freight cost comparison" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New forwarder</Button>} />
      <Card>
        <div className="border-b border-line p-4 dark:border-navy-700"><SearchInput value={q} onChange={setQ} placeholder="Search forwarders…" className="max-w-sm" /></div>
        {forwarders.isLoading ? <TableSkeleton /> : forwarders.isError ? <ErrorState error={forwarders.error} onRetry={() => forwarders.refetch()} /> : (
          <DataTable columns={columns} rows={rows} rowKey={(f) => f.id} initialSort={{ key: 'name', dir: 'asc' }}
            empty={<EmptyState icon={<Truck className="h-6 w-6" />} title={forwarders.data?.length ? 'No match' : 'No freight forwarders yet'} action={!forwarders.data?.length && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New forwarder</Button>} />} />
        )}
      </Card>
      <ForwarderFormModal open={open} onClose={() => setOpen(false)} forwarder={editing} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting)} loading={del.isPending} title="Delete forwarder?"
        message={`${deleting?.name} will be permanently deleted. Forwarders linked to shipments cannot be deleted — deactivate instead.`} confirmLabel="Delete" />
    </div>
  );
}
