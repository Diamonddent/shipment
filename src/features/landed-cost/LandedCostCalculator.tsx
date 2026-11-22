import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Save, AlertTriangle } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, Select, useToast } from '@/components/ui';
import { allocationsService } from '@/services/shipmentProducts';
import { qk } from '@/hooks/queries';
import {
  ALLOCATION_METHOD_LABELS,
  allocateShipment,
  sumMoney,
  toCents,
  type AllocationMethod,
  type CategoryToAllocate,
} from '@/lib/calculations';
import { fmtAmount, fmtMoney, fmtNum, fmtPct, fmtDateTime } from '@/lib/format';
import { exportExcel, stamp } from '@/lib/export';
import type { ExpenseAllocation, ExpenseCategory, ExpenseWithRefs, Shipment, ShipmentProduct } from '@/types/database';

const METHODS = Object.keys(ALLOCATION_METHOD_LABELS) as AllocationMethod[];

export function useAllocationModel(
  products: ShipmentProduct[],
  expenses: ExpenseWithRefs[],
  categories: ExpenseCategory[],
  saved: ExpenseAllocation[],
  methods: Record<string, AllocationMethod>,
  manual: Record<string, Record<string, number>>,
) {
  return useMemo(() => {
    const byCat = new Map<string, { cat: ExpenseCategory; cents: number }>();
    for (const e of expenses) {
      if (e.is_deleted) continue;
      const cat = categories.find((c) => c.id === e.category_id);
      if (!cat || !cat.is_allocatable) continue;
      const prev = byCat.get(cat.id);
      byCat.set(cat.id, { cat, cents: (prev?.cents ?? 0) + toCents(Number(e.amount_sar)) });
    }
    const cats: CategoryToAllocate[] = [...byCat.values()]
      .sort((a, b) => a.cat.sort_order - b.cat.sort_order)
      .map(({ cat, cents }) => ({
        category_id: cat.id,
        category_name: cat.name,
        amount_sar: cents / 100,
        method: methods[cat.id] ?? saved.find((s) => s.category_id === cat.id)?.method ?? cat.default_allocation_method,
        manualShares: manual[cat.id],
      }));
    const result = allocateShipment(
      products.map((p) => ({
        id: p.id,
        label: p.item_code,
        quantity: Number(p.quantity),
        invoice_value_sar: Number(p.invoice_value_sar),
        net_weight: p.net_weight,
        gross_weight: p.gross_weight,
      })),
      cats,
    );
    // saved run still matches the current calculation?
    const key = (r: { category_id: string; shipment_product_id: string; allocated_amount_sar: number }) =>
      `${r.category_id}|${r.shipment_product_id}|${toCents(Number(r.allocated_amount_sar))}`;
    const savedKeys = new Set(saved.map(key));
    const isSavedCurrent = saved.length > 0 && saved.length === result.rows.length && result.rows.every((r) => savedKeys.has(key(r)));
    return { cats, result, isSavedCurrent };
  }, [products, expenses, categories, saved, methods, manual]);
}

export function LandedCostCalculator({
  shipment,
  products,
  expenses,
  categories,
  saved,
  canEdit,
}: {
  shipment: Pick<Shipment, 'id' | 'shipment_code' | 'po_number'>;
  products: ShipmentProduct[];
  expenses: ExpenseWithRefs[];
  categories: ExpenseCategory[];
  saved: ExpenseAllocation[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [methods, setMethods] = useState<Record<string, AllocationMethod>>({});
  const [manual, setManual] = useState<Record<string, Record<string, number>>>({});

  // initialise manual shares from a saved manual run
  useEffect(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const s of saved) if (s.method === 'manual') (m[s.category_id] ||= {})[s.shipment_product_id] = Number(s.basis_value);
    setManual(m);
    setMethods({});
  }, [saved, shipment.id]);

  const { cats, result, isSavedCurrent } = useAllocationModel(products, expenses, categories, saved, methods, manual);
  const savedAt = saved.reduce<string | null>((a, s) => (!a || s.calculated_at > a ? s.calculated_at : a), null);
  const vatCatIds = new Set(categories.filter((c) => c.is_recoverable_vat).map((c) => c.id));
  const productsTotal = sumMoney(products.map((p) => Number(p.invoice_value_sar)));
  const piTotal = sumMoney(expenses.filter((e) => e.category?.cost_group === 'product_invoice').map((e) => Number(e.amount_sar)));

  const save = useMutation({
    mutationFn: () => allocationsService.save(shipment.id, result.rows),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: qk.allocations(shipment.id) });
      qc.invalidateQueries({ queryKey: qk.allAllocations });
      qc.invalidateQueries({ queryKey: qk.shipment(shipment.id) });
      toast.success('Landed cost saved', `${n} allocation lines stored`);
    },
    onError: (e) => toast.error('Could not save allocation', e),
  });

  const exportIt = () =>
    exportExcel(
      `LandedCost_${shipment.shipment_code}_${stamp()}`,
      [
        {
          name: 'Product landed cost',
          columns: [
            { header: 'Item code', key: 'code' },
            { header: 'Description', key: 'desc', width: 34 },
            { header: 'Quantity', key: 'qty', format: 'num' },
            { header: 'Invoice value SAR', key: 'inv', format: 'money' },
            ...cats.map((c) => ({ header: c.category_name, key: `c_${c.category_id}`, format: 'money' as const })),
            { header: 'Allocated SAR', key: 'alloc', format: 'money' },
            { header: 'Landed cost SAR', key: 'landed', format: 'money' },
            { header: 'Landed cost / unit', key: 'unit', format: 'money' },
            { header: 'Uplift %', key: 'uplift', format: 'pct' },
          ],
          rows: result.products.map((p) => {
            const src = products.find((x) => x.id === p.id)!;
            return {
              code: src.item_code,
              desc: src.description,
              qty: p.quantity,
              inv: p.invoice_value_sar,
              ...Object.fromEntries(cats.map((c) => [`c_${c.category_id}`, p.allocated_by_category[c.category_id] ?? 0])),
              alloc: p.allocated_total,
              landed: p.landed_cost,
              unit: p.landed_cost_per_unit,
              uplift: p.uplift_pct,
            };
          }),
        },
        {
          name: 'Allocation methods',
          columns: [
            { header: 'Category', key: 'name', width: 26 },
            { header: 'Amount SAR', key: 'amount', format: 'money' },
            { header: 'Method', key: 'method', width: 20 },
          ],
          rows: cats.map((c) => ({ name: c.category_name, amount: c.amount_sar, method: ALLOCATION_METHOD_LABELS[c.method] })),
        },
      ],
      { title: `Product landed cost — ${shipment.shipment_code}`, subtitle: `PO ${shipment.po_number ?? '—'}` },
    );

  if (products.length === 0)
    return <EmptyState title="Add products first" message="Product landed cost is calculated by allocating shipment expenses across the products in the shipment." />;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Allocation method per expense category"
          subtitle="Choose how each shipment expense is spread across products. Rounding is reconciled so every category allocates exactly its total."
          actions={
            isSavedCurrent ? (
              <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Saved {fmtDateTime(savedAt)}</Badge>
            ) : saved.length ? (
              <Badge tone="amber"><AlertTriangle className="h-3 w-3" /> Saved result is out of date</Badge>
            ) : (
              <Badge tone="slate">Not saved yet</Badge>
            )
          }
        />
        {cats.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No allocatable expenses yet (freight, customs, clearance…). Landed cost equals the product invoice value.</p>
        ) : (
          <div className="divide-y divide-line dark:divide-navy-700">
            {cats.map((c) => {
              const issue = result.issues.find((i) => i.category_id === c.category_id);
              const allocated = sumMoney(result.rows.filter((r) => r.category_id === c.category_id).map((r) => r.allocated_amount_sar));
              return (
                <div key={c.category_id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{c.category_name}</p>
                      <p className="text-xs tabular-nums text-slate-500">{fmtMoney(c.amount_sar)}</p>
                    </div>
                    <Select
                      className="w-48"
                      value={c.method}
                      onChange={(e) => setMethods((m) => ({ ...m, [c.category_id]: e.target.value as AllocationMethod }))}
                      disabled={!canEdit}
                      aria-label={`Allocation method for ${c.category_name}`}
                    >
                      {METHODS.map((m) => <option key={m} value={m}>{ALLOCATION_METHOD_LABELS[m]}</option>)}
                    </Select>
                    <div className="w-40 text-right text-xs">
                      {issue ? (
                        <span className="text-red-600">{issue.message}</span>
                      ) : (
                        <span className="text-emerald-600">Allocated {fmtAmount(allocated)} ✓</span>
                      )}
                    </div>
                  </div>
                  {c.method === 'manual' && (
                    <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 dark:bg-navy-800 sm:grid-cols-2 lg:grid-cols-3">
                      {products.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate">{p.item_code}</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            className="h-8 w-24 text-right"
                            value={manual[c.category_id]?.[p.id] ?? ''}
                            disabled={!canEdit}
                            onChange={(e) =>
                              setManual((m) => ({ ...m, [c.category_id]: { ...(m[c.category_id] ?? {}), [p.id]: Number(e.target.value) || 0 } }))
                            }
                          />
                          <span className="text-slate-500">%</span>
                        </label>
                      ))}
                      <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
                        Total: {fmtPct(Object.values(manual[c.category_id] ?? {}).reduce((a, b) => a + b, 0))} (must be 100%)
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {Math.abs(toCents(productsTotal) - toCents(piTotal)) > 100 && piTotal > 0 && (
        <Alert tone="amber" title="Products total differs from the Product Invoice expense">
          Products: {fmtMoney(productsTotal)} · Product Invoice expense: {fmtMoney(piTotal)}. Product landed costs use the product lines; check quantities, prices and rates.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-white px-4 py-3 dark:border-navy-700 dark:bg-navy-900">
          <p className="text-xs text-slate-500">To allocate</p>
          <p className="text-lg font-semibold tabular-nums">{fmtMoney(result.totalToAllocate)}</p>
        </div>
        <div className="rounded-xl border border-line bg-white px-4 py-3 dark:border-navy-700 dark:bg-navy-900">
          <p className="text-xs text-slate-500">Allocated</p>
          <p className="text-lg font-semibold tabular-nums">{fmtMoney(result.totalAllocated)}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${result.reconciled ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'}`}>
          <p className="text-xs text-slate-500">Difference</p>
          <p className="text-lg font-semibold tabular-nums">{fmtMoney(sumMoney([result.totalToAllocate, -result.totalAllocated]))} {result.reconciled ? '✓ reconciled' : ''}</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Landed cost per product"
          subtitle="Landed Cost = Product Invoice Value + Allocated Expenses · Per Unit = Landed Cost ÷ Quantity"
          actions={
            <>
              <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void exportIt()}>Excel</Button>
              {canEdit && (
                <Button size="sm" icon={<Save className="h-4 w-4" />} onClick={() => save.mutate()} loading={save.isPending} disabled={!result.reconciled || isSavedCurrent}>
                  Save landed cost
                </Button>
              )}
            </>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line bg-slate-50/80 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-navy-700 dark:bg-navy-800/60">
                <th className="px-4 py-2.5 text-left">Product</th>
                <th className="px-3 py-2.5">Qty</th>
                <th className="px-3 py-2.5">Invoice SAR</th>
                {cats.map((c) => <th key={c.category_id} className="whitespace-nowrap px-3 py-2.5">{c.category_name}</th>)}
                <th className="px-3 py-2.5">Allocated</th>
                <th className="px-3 py-2.5">Landed cost</th>
                <th className="px-3 py-2.5">Excl. VAT</th>
                <th className="px-3 py-2.5">Per unit</th>
                <th className="px-4 py-2.5">Uplift</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-right dark:divide-navy-700">
              {result.products.map((p) => {
                const src = products.find((x) => x.id === p.id)!;
                const vat = sumMoney(Object.entries(p.allocated_by_category).filter(([k]) => vatCatIds.has(k)).map(([, v]) => v));
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 text-left"><p className="font-medium text-slate-900 dark:text-white">{src.item_code}</p><p className="max-w-[240px] truncate text-xs text-slate-500">{src.description}</p></td>
                    <td className="px-3">{fmtNum(p.quantity)}</td>
                    <td className="px-3">{fmtAmount(p.invoice_value_sar)}</td>
                    {cats.map((c) => <td key={c.category_id} className="px-3 text-slate-600 dark:text-slate-300">{fmtAmount(p.allocated_by_category[c.category_id] ?? 0)}</td>)}
                    <td className="px-3">{fmtAmount(p.allocated_total)}</td>
                    <td className="px-3 font-semibold text-slate-900 dark:text-white">{fmtAmount(p.landed_cost)}</td>
                    <td className="px-3 text-slate-600 dark:text-slate-300">{fmtAmount(sumMoney([p.landed_cost, -vat]))}</td>
                    <td className="px-3 font-semibold text-primary dark:text-accent-100">{fmtNum(p.landed_cost_per_unit, 4)}</td>
                    <td className="px-4">{fmtPct(p.uplift_pct)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-slate-50 text-right font-semibold dark:border-navy-700 dark:bg-navy-800/60">
                <td className="px-4 py-2.5 text-left">Total</td>
                <td className="px-3" />
                <td className="px-3">{fmtAmount(sumMoney(result.products.map((p) => p.invoice_value_sar)))}</td>
                {cats.map((c) => (
                  <td key={c.category_id} className="px-3">{fmtAmount(sumMoney(result.rows.filter((r) => r.category_id === c.category_id).map((r) => r.allocated_amount_sar)))}</td>
                ))}
                <td className="px-3">{fmtAmount(result.totalAllocated)}</td>
                <td className="px-3">{fmtAmount(sumMoney(result.products.map((p) => p.landed_cost)))}</td>
                <td className="px-3" />
                <td className="px-3" />
                <td className="px-4" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
