import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, DataTable, EmptyState, useToast, type Column } from '@/components/ui';
import { shipmentProductsService } from '@/services/shipmentProducts';
import { qk } from '@/hooks/queries';
import { sumMoney } from '@/lib/calculations';
import { fmtAmount, fmtDate, fmtNum, fmtRate } from '@/lib/format';
import type { Shipment, ShipmentProduct } from '@/types/database';
import { ShipmentProductFormModal } from './ShipmentProductFormModal';

export function ShipmentProductsTable({
  shipment,
  rows,
  canEdit,
}: {
  shipment: Pick<Shipment, 'id' | 'currency_code' | 'exchange_rate' | 'country_of_origin'>;
  rows: ShipmentProduct[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<ShipmentProduct | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ShipmentProduct | null>(null);
  const del = useMutation({
    mutationFn: (p: ShipmentProduct) => shipmentProductsService.remove(p.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shipmentProducts(shipment.id) });
      qc.invalidateQueries({ queryKey: qk.allocations(shipment.id) });
      toast.success('Product line removed');
      setDeleting(null);
    },
    onError: (e) => toast.error('Could not remove product', e),
  });

  const columns: Column<ShipmentProduct>[] = [
    { key: 'code', header: 'Item', sortValue: (p) => p.item_code, cell: (p) => <div className="min-w-[180px]"><p className="font-medium text-slate-900 dark:text-white">{p.item_code}</p><p className="text-xs text-slate-500">{p.description}</p></div> },
    { key: 'brand', header: 'Brand / HS', hideBelow: 'lg', cell: (p) => <div className="text-xs"><p>{p.brand ?? p.manufacturer ?? '—'}</p><p className="text-slate-500">{p.hs_code ?? ''}</p></div> },
    { key: 'qty', header: 'Qty', align: 'right', sortValue: (p) => Number(p.quantity), cell: (p) => `${fmtNum(p.quantity)} ${p.unit_of_measure}` },
    { key: 'price', header: 'Unit price', align: 'right', hideBelow: 'md', cell: (p) => <div><p>{p.currency_code} {fmtNum(p.unit_price, 4)}</p>{p.currency_code !== 'SAR' && <p className="text-xs text-slate-500">@ {fmtRate(p.exchange_rate)}</p>}</div> },
    { key: 'total', header: 'Invoice value', align: 'right', hideBelow: 'md', cell: (p) => `${p.currency_code} ${fmtAmount(p.total_invoice_value)}` },
    { key: 'sar', header: 'Value SAR', align: 'right', sortValue: (p) => Number(p.invoice_value_sar), cell: (p) => <span className="font-semibold">{fmtAmount(p.invoice_value_sar)}</span>, footer: fmtAmount(sumMoney(rows.map((r) => Number(r.invoice_value_sar)))) },
    { key: 'w', header: 'N.W. / G.W. kg', align: 'right', hideBelow: 'lg', cell: (p) => `${fmtNum(p.net_weight)} / ${fmtNum(p.gross_weight)}` },
    { key: 'lot', header: 'Lot / expiry', hideBelow: 'lg', cell: (p) => <div className="text-xs"><p>{p.lot_number ?? '—'}</p><p className="text-slate-500">{fmtDate(p.expiry_date)}</p></div> },
    {
      key: 'a',
      header: '',
      align: 'right',
      cell: (p) =>
        canEdit ? (
          <div className="flex justify-end gap-1">
            <button onClick={() => setEditing(p)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-navy-800" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => setDeleting(p)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      {canEdit && rows.length > 0 && (
        <div className="flex justify-end border-b border-line px-4 py-3 dark:border-navy-700">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add product</Button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        showFooter={rows.length > 0}
        empty={
          <EmptyState
            title="No products in this shipment"
            message="Add each line from the supplier invoice / packing list to calculate product landed costs."
            action={canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add product</Button>}
          />
        }
      />
      <ShipmentProductFormModal open={adding || !!editing} onClose={() => { setAdding(false); setEditing(null); }} shipment={shipment} line={editing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting)}
        loading={del.isPending}
        title="Remove product line?"
        message={`${deleting?.item_code} — ${deleting?.description}. Saved landed-cost allocations for this line are removed too; recalculate afterwards.`}
        confirmLabel="Remove"
      />
    </>
  );
}
