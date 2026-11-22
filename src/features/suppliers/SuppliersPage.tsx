import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, DataTable, DemoBadge, Dropdown, EmptyState, ErrorState, PageHeader, SearchInput, TableSkeleton, useToast, type Column } from '@/components/ui';
import { qk, toCalcExpense, useAllExpenses, useSettings, useShipments, useSuppliers } from '@/hooks/queries';
import { usePermissions } from '@/hooks/useAuth';
import { suppliersService } from '@/services/masterData';
import { analyzeShipmentCost, sumMoney } from '@/lib/calculations';
import { fmtAmount, fmtPct } from '@/lib/format';
import { percentOf } from '@/lib/calculations';
import type { Supplier } from '@/types/database';
import { SupplierFormModal } from './SupplierFormModal';

export default function SuppliersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const perms = usePermissions();
  const suppliers = useSuppliers();
  const shipments = useShipments();
  const expenses = useAllExpenses();
  const { settings } = useSettings();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; expenses: number; invoice: number }>();
    for (const s of shipments.data ?? []) {
      if (!s.supplier_id || s.status === 'cancelled') continue;
      const a = analyzeShipmentCost((expenses.data ?? []).filter((e) => e.shipment_id === s.id).map(toCalcExpense), { includeLineVat: settings.includeLineVat });
      const cur = m.get(s.supplier_id) ?? { count: 0, expenses: 0, invoice: 0 };
      m.set(s.supplier_id, { count: cur.count + 1, expenses: sumMoney([cur.expenses, a.additionalExpenseTotal]), invoice: sumMoney([cur.invoice, a.productInvoiceValue]) });
    }
    return m;
  }, [shipments.data, expenses.data, settings.includeLineVat]);

  const rows = (suppliers.data ?? []).filter((s) => !q || [s.name, s.country, s.contact_person, s.email].join(' ').toLowerCase().includes(q.toLowerCase()));

  const toggle = useMutation({
    mutationFn: (s: Supplier) => suppliersService.update(s.id, { is_active: !s.is_active }),
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: qk.suppliers }); toast.success(s.is_active ? 'Supplier activated' : 'Supplier deactivated'); },
    onError: (e) => toast.error('Update failed', e),
  });
  const del = useMutation({
    mutationFn: (s: Supplier) => suppliersService.remove(s.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.suppliers }); setDeleting(null); toast.success('Supplier deleted'); },
    onError: (e) => { setDeleting(null); toast.error('Could not delete supplier — it is used by shipments. Deactivate it instead.', e); },
  });

  const expPct = (id: string) => {
    const st = stats.get(id);
    return st && st.invoice > 0 ? percentOf(st.expenses, st.invoice) : null;
  };
  const columns: Column<Supplier>[] = [
    { key: 'name', header: 'Supplier', sortValue: (s) => s.name, cell: (s) => <div className="min-w-[200px]"><p className="font-medium text-slate-900 dark:text-white">{s.name} <DemoBadge show={s.is_demo} /></p><p className="text-xs text-slate-500">{[s.city, s.country].filter(Boolean).join(', ') || '—'}</p></div> },
    { key: 'contact', header: 'Contact', hideBelow: 'md', cell: (s) => <div className="text-xs"><p>{s.contact_person ?? '—'}</p><p className="text-slate-500">{s.email ?? ''} {s.phone ?? ''}</p></div> },
    { key: 'terms', header: 'Terms / currency', hideBelow: 'lg', cell: (s) => <div className="text-xs"><p>{s.payment_terms ?? '—'}</p><p className="text-slate-500">{s.default_currency ?? ''}</p></div> },
    { key: 'count', header: 'Shipments', align: 'right', sortValue: (s) => stats.get(s.id)?.count ?? 0, cell: (s) => stats.get(s.id)?.count ?? 0 },
    { key: 'inv', header: 'Invoice value SAR', align: 'right', hideBelow: 'md', sortValue: (s) => stats.get(s.id)?.invoice ?? 0, cell: (s) => fmtAmount(stats.get(s.id)?.invoice ?? 0) },
    { key: 'expenses', header: 'Total expenses SAR', align: 'right', hideBelow: 'md', sortValue: (s) => stats.get(s.id)?.expenses ?? 0, cell: (s) => fmtAmount(stats.get(s.id)?.expenses ?? 0) },
    { key: 'pct', header: 'Expenses % of invoice', align: 'right', sortValue: (s) => expPct(s.id) ?? -1, cell: (s) => <span className="font-semibold">{fmtPct(expPct(s.id))}</span> },
    { key: 'status', header: 'Status', cell: (s) => <Badge tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'a', header: '', align: 'right',
      cell: (s) => (
        <Dropdown
          trigger={<button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-800" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></button>}
          items={[
            { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => { setEditing(s); setOpen(true); }, hidden: !perms.canEditMaster(s.created_by) },
            { label: s.is_active ? 'Deactivate' : 'Activate', icon: <Power className="h-4 w-4" />, onClick: () => toggle.mutate(s), hidden: !perms.canEditMaster(s.created_by) },
            { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleting(s), danger: true, hidden: !perms.canDeleteMaster },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Manufacturers and vendors you import from" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New supplier</Button>} />
      <Card>
        <div className="border-b border-line p-4 dark:border-navy-700"><SearchInput value={q} onChange={setQ} placeholder="Search suppliers…" className="max-w-sm" /></div>
        {suppliers.isLoading ? <TableSkeleton /> : suppliers.isError ? <ErrorState error={suppliers.error} onRetry={() => suppliers.refetch()} /> : (
          <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} initialSort={{ key: 'name', dir: 'asc' }}
            empty={<EmptyState icon={<Building2 className="h-6 w-6" />} title={suppliers.data?.length ? 'No match' : 'No suppliers yet'} action={!suppliers.data?.length && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New supplier</Button>} />} />
        )}
      </Card>
      <SupplierFormModal open={open} onClose={() => setOpen(false)} supplier={editing} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting)} loading={del.isPending} title="Delete supplier?"
        message={`${deleting?.name} will be permanently deleted. Suppliers linked to shipments cannot be deleted — deactivate them instead.`} confirmLabel="Delete" />
    </div>
  );
}
