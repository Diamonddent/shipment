import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Download, MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, DataTable, DemoBadge, Dropdown, EmptyState, ErrorState, PageHeader, SearchInput, TableSkeleton, Tabs, useToast, type Column } from '@/components/ui';
import { qk, useAllAllocations, useAllShipmentProducts, useProducts, useShipments } from '@/hooks/queries';
import { usePermissions } from '@/hooks/useAuth';
import { productsService } from '@/services/masterData';
import { roundTo, sumMoney } from '@/lib/calculations';
import { fmtAmount, fmtDate, fmtNum } from '@/lib/format';
import { exportExcel, stamp } from '@/lib/export';
import type { Product, ShipmentProduct } from '@/types/database';
import { ProductFormModal } from './ProductFormModal';

type Tab = 'catalogue' | 'lines';

export default function ProductsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const perms = usePermissions();
  const products = useProducts();
  const lines = useAllShipmentProducts();
  const shipments = useShipments(true);
  const allocations = useAllAllocations();
  const [tab, setTab] = useState<Tab>('catalogue');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const allocBy = useMemo(() => {
    const m = new Map<string, number>();
    (allocations.data ?? []).forEach((a) => m.set(a.shipment_product_id, sumMoney([m.get(a.shipment_product_id) ?? 0, Number(a.allocated_amount_sar)])));
    return m;
  }, [allocations.data]);
  const shipmentOf = (id: string) => shipments.data?.find((s) => s.id === id);

  const needle = q.toLowerCase();
  const catRows = (products.data ?? []).filter((p) => !needle || [p.item_code, p.description, p.brand, p.manufacturer, p.hs_code].join(' ').toLowerCase().includes(needle));
  const lineRows = (lines.data ?? []).filter((l) => !needle || [l.item_code, l.description, l.lot_number, shipmentOf(l.shipment_id)?.shipment_code].join(' ').toLowerCase().includes(needle));

  const toggle = useMutation({
    mutationFn: (p: Product) => productsService.update(p.id, { is_active: !p.is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.products }); toast.success('Product updated'); },
    onError: (e) => toast.error('Update failed', e),
  });
  const del = useMutation({
    mutationFn: (p: Product) => productsService.remove(p.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.products }); setDeleting(null); toast.success('Product deleted from catalogue', 'Existing shipment lines keep their data.'); },
    onError: (e) => { setDeleting(null); toast.error('Could not delete product', e); },
  });

  const catCols: Column<Product>[] = [
    { key: 'code', header: 'Item', sortValue: (p) => p.item_code, cell: (p) => <div className="min-w-[200px]"><p className="font-medium text-slate-900 dark:text-white">{p.item_code} <DemoBadge show={p.is_demo} /></p><p className="text-xs text-slate-500">{p.description}</p></div> },
    { key: 'brand', header: 'Manufacturer / brand', hideBelow: 'md', sortValue: (p) => p.brand ?? '', cell: (p) => <div className="text-xs"><p>{p.manufacturer ?? '—'}</p><p className="text-slate-500">{p.brand ?? ''}</p></div> },
    { key: 'hs', header: 'HS code', hideBelow: 'lg', cell: (p) => p.hs_code ?? '—' },
    { key: 'origin', header: 'Origin', hideBelow: 'lg', cell: (p) => p.country_of_origin ?? '—' },
    { key: 'uom', header: 'UoM', cell: (p) => p.unit_of_measure },
    { key: 'price', header: 'Default price', align: 'right', hideBelow: 'md', cell: (p) => (p.default_unit_price !== null ? `${p.default_currency ?? ''} ${fmtNum(p.default_unit_price, 4)}` : '—') },
    { key: 'w', header: 'N.W./G.W. per unit', align: 'right', hideBelow: 'lg', cell: (p) => `${fmtNum(p.unit_net_weight, 4)} / ${fmtNum(p.unit_gross_weight, 4)}` },
    { key: 'st', header: 'Status', cell: (p) => <Badge tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'a', header: '', align: 'right',
      cell: (p) => (
        <Dropdown
          trigger={<button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-800" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></button>}
          items={[
            { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => { setEditing(p); setOpen(true); }, hidden: !perms.canEditMaster(p.created_by) },
            { label: p.is_active ? 'Deactivate' : 'Activate', icon: <Power className="h-4 w-4" />, onClick: () => toggle.mutate(p), hidden: !perms.canEditMaster(p.created_by) },
            { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleting(p), danger: true, hidden: !perms.canDeleteMaster },
          ]}
        />
      ),
    },
  ];

  const landed = (l: ShipmentProduct) => (allocBy.has(l.id) ? sumMoney([Number(l.invoice_value_sar), allocBy.get(l.id)!]) : null);
  const lineCols: Column<ShipmentProduct>[] = [
    { key: 'code', header: 'Item', sortValue: (l) => l.item_code, cell: (l) => <div className="min-w-[180px]"><p className="font-medium text-slate-900 dark:text-white">{l.item_code}</p><p className="text-xs text-slate-500">{l.description}</p></div> },
    { key: 'shp', header: 'Shipment', sortValue: (l) => shipmentOf(l.shipment_id)?.shipment_code ?? '', cell: (l) => <Link className="text-accent hover:underline" to={`/shipments/${l.shipment_id}?tab=products`}>{shipmentOf(l.shipment_id)?.shipment_code ?? '—'}</Link> },
    { key: 'qty', header: 'Qty', align: 'right', sortValue: (l) => Number(l.quantity), cell: (l) => `${fmtNum(l.quantity)} ${l.unit_of_measure}` },
    { key: 'val', header: 'Invoice SAR', align: 'right', sortValue: (l) => Number(l.invoice_value_sar), cell: (l) => fmtAmount(l.invoice_value_sar) },
    { key: 'landed', header: 'Landed SAR', align: 'right', sortValue: (l) => landed(l) ?? -1, cell: (l) => (landed(l) !== null ? <span className="font-semibold">{fmtAmount(landed(l))}</span> : <span className="text-xs text-slate-400">not calculated</span>) },
    { key: 'unit', header: 'Per unit SAR', align: 'right', sortValue: (l) => (landed(l) ?? -1) / Number(l.quantity), cell: (l) => (landed(l) !== null ? fmtNum(roundTo(landed(l)! / Number(l.quantity), 4), 4) : '—') },
    { key: 'lot', header: 'Lot / expiry', hideBelow: 'lg', cell: (l) => <div className="text-xs"><p>{l.lot_number ?? '—'}</p><p className="text-slate-500">{fmtDate(l.expiry_date)}</p></div> },
  ];

  const exportLines = () =>
    exportExcel(`Product-Lines_${stamp()}`, [{
      name: 'Shipment product lines',
      columns: [
        { header: 'Item code', key: 'code' }, { header: 'Description', key: 'desc', width: 34 }, { header: 'Shipment', key: 'shp' }, { header: 'Qty', key: 'qty', format: 'num' },
        { header: 'UoM', key: 'uom' }, { header: 'Unit price', key: 'price', format: 'num' }, { header: 'Currency', key: 'cur' }, { header: 'Rate', key: 'rate', format: 'rate' },
        { header: 'Invoice SAR', key: 'inv', format: 'money' }, { header: 'Landed SAR', key: 'landed', format: 'money' }, { header: 'Lot', key: 'lot' }, { header: 'Expiry', key: 'exp', format: 'date' },
      ],
      rows: lineRows.map((l) => ({ code: l.item_code, desc: l.description, shp: shipmentOf(l.shipment_id)?.shipment_code ?? '', qty: Number(l.quantity), uom: l.unit_of_measure, price: Number(l.unit_price), cur: l.currency_code, rate: Number(l.exchange_rate), inv: Number(l.invoice_value_sar), landed: landed(l) ?? '', lot: l.lot_number ?? '', exp: l.expiry_date })),
    }]);

  return (
    <div>
      <PageHeader
        title="Product Management"
        subtitle="Product catalogue and every product line imported in shipments"
        actions={tab === 'catalogue'
          ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New product</Button>
          : <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void exportLines()} disabled={!lineRows.length}>Export Excel</Button>}
      />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'catalogue', label: 'Catalogue', count: products.data?.length }, { value: 'lines', label: 'Shipment lines', count: lines.data?.length }]} />
      <Card>
        <div className="border-b border-line p-4 dark:border-navy-700"><SearchInput value={q} onChange={setQ} placeholder="Search item code, description, brand…" className="max-w-sm" /></div>
        {tab === 'catalogue' ? (
          products.isLoading ? <TableSkeleton /> : products.isError ? <ErrorState error={products.error} onRetry={() => products.refetch()} /> : (
            <DataTable columns={catCols} rows={catRows} rowKey={(p) => p.id} initialSort={{ key: 'code', dir: 'asc' }}
              empty={<EmptyState icon={<Boxes className="h-6 w-6" />} title={products.data?.length ? 'No match' : 'No products yet'} message="Products can also be added directly to a shipment and saved to the catalogue." />} />
          )
        ) : lines.isLoading ? <TableSkeleton /> : lines.isError ? <ErrorState error={lines.error} onRetry={() => lines.refetch()} /> : (
          <DataTable columns={lineCols} rows={lineRows} rowKey={(l) => l.id} empty={<EmptyState title="No product lines in shipments yet" />} />
        )}
      </Card>
      <ProductFormModal open={open} onClose={() => setOpen(false)} product={editing} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting)} loading={del.isPending} title="Delete product?" message={`${deleting?.item_code} will be removed from the catalogue. Shipment lines that used it keep their own copy of the data.`} confirmLabel="Delete" />
    </div>
  );
}
