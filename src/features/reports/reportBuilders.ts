/**
 * Report definitions. Each builder turns raw rows into export tables using
 * the tested calculations in src/lib/calculations.ts.
 */
import {
  COST_GROUPS, COST_GROUP_LABELS, allocateShipment, analyzeShipmentCost, outstandingSar, percentOf, sumMoney, toCents,
  type ShipmentCostAnalysis, type CategoryToAllocate,
} from '@/lib/calculations';
import { PAYMENT_STATUS_LABEL, SHIPMENT_STATUS_LABEL, SHIPPING_METHOD_LABEL } from '@/lib/constants';
import type { ExportColumn, ExportTable } from '@/lib/export';
import { toCalcExpense } from '@/hooks/queries';
import { inRange, todayISO } from '@/lib/utils';
import { monthKey, monthLabel } from '@/lib/format';
import type {
  ExpenseAllocation, ExpenseCategory, ExpenseWithRefs, FreightForwarder, ShipmentProduct, ShipmentWithRefs, Supplier,
} from '@/types/database';

export interface ReportData {
  shipments: ShipmentWithRefs[];
  expenses: ExpenseWithRefs[];
  products: ShipmentProduct[];
  allocations: ExpenseAllocation[];
  categories: ExpenseCategory[];
  suppliers: Supplier[];
  forwarders: FreightForwarder[];
  includeLineVat: boolean;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  supplierId?: string;
  shipmentId?: string;
  includeCancelled?: boolean;
}

export interface ReportDef {
  id: string;
  title: string;
  description: string;
  orientation: 'portrait' | 'landscape';
  build: (ctx: ReportContext) => ExportTable[];
}

export interface ReportContext {
  data: ReportData;
  filters: ReportFilters;
  shipments: ShipmentWithRefs[];
  analyses: Map<string, ShipmentCostAnalysis>;
  expensesOf: (shipmentId: string) => ExpenseWithRefs[];
}

export function buildContext(data: ReportData, filters: ReportFilters): ReportContext {
  const byShipment = new Map<string, ExpenseWithRefs[]>();
  for (const e of data.expenses) {
    if (e.is_deleted) continue;
    const arr = byShipment.get(e.shipment_id) ?? [];
    arr.push(e);
    byShipment.set(e.shipment_id, arr);
  }
  const shipments = data.shipments.filter(
    (s) =>
      !s.is_archived &&
      (filters.includeCancelled || s.status !== 'cancelled' || filters.shipmentId === s.id) &&
      (!filters.supplierId || s.supplier_id === filters.supplierId) &&
      (!filters.shipmentId || s.id === filters.shipmentId) &&
      inRange(s.supplier_invoice_date ?? s.created_at, filters.from, filters.to),
  );
  const analyses = new Map<string, ShipmentCostAnalysis>();
  for (const s of shipments) analyses.set(s.id, analyzeShipmentCost((byShipment.get(s.id) ?? []).map(toCalcExpense), { includeLineVat: data.includeLineVat }));
  return { data, filters, shipments, analyses, expensesOf: (id) => byShipment.get(id) ?? [] };
}

const money = (header: string, key: string): ExportColumn => ({ header, key, format: 'money', width: 16 });
const pct = (header: string, key: string): ExportColumn => ({ header, key, format: 'pct', width: 12 });

interface Agg {
  shipments: number;
  invoice: number;
  groups: Record<string, number>;
  landed: number;
  additional: number;
}
function aggregate(ctx: ReportContext, keyOf: (s: ShipmentWithRefs) => string): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const s of ctx.shipments) {
    const a = ctx.analyses.get(s.id)!;
    const k = keyOf(s);
    const cur = m.get(k) ?? { shipments: 0, invoice: 0, groups: {}, landed: 0, additional: 0 };
    cur.shipments += 1;
    cur.invoice = sumMoney([cur.invoice, a.productInvoiceValue]);
    cur.landed = sumMoney([cur.landed, a.totalLandedCost]);
    cur.additional = sumMoney([cur.additional, a.additionalExpenseTotal]);
    for (const g of COST_GROUPS) cur.groups[g] = sumMoney([cur.groups[g] ?? 0, a.byGroup[g]]);
    m.set(k, cur);
  }
  return m;
}
const groupCols = (): ExportColumn[] => COST_GROUPS.filter((g) => g !== 'product_invoice').map((g) => money(COST_GROUP_LABELS[g], `g_${g}`));
const groupVals = (a: Agg | ShipmentCostAnalysis) =>
  Object.fromEntries(COST_GROUPS.filter((g) => g !== 'product_invoice').map((g) => [`g_${g}`, 'byGroup' in a ? a.byGroup[g] : a.groups[g] ?? 0]));
const totalsOf = (rows: Record<string, unknown>[], keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, sumMoney(rows.map((r) => Number(r[k]) || 0))]));

export const REPORTS: ReportDef[] = [
  {
    id: 'shipment-summary',
    title: 'Shipment Summary Report',
    description: 'One line per shipment: supplier, route, status, invoice value, additional costs, landed cost and outstanding payments.',
    orientation: 'landscape',
    build: (ctx) => {
      const rows = ctx.shipments.map((s) => {
        const a = ctx.analyses.get(s.id)!;
        const exps = ctx.expensesOf(s.id);
        return {
          code: s.shipment_code, po: s.po_number ?? '', supplier: s.supplier?.name ?? '', country: s.country_of_origin ?? '',
          method: s.shipping_method ? SHIPPING_METHOD_LABEL[s.shipping_method] : '', status: SHIPMENT_STATUS_LABEL[s.status], date: s.supplier_invoice_date,
          invoice: a.productInvoiceValue, additional: a.additionalExpenseTotal, landed: a.totalLandedCost, addPct: a.additionalExpensePercentage ?? '',
          outstanding: sumMoney(exps.map((e) => outstandingSar(Number(e.original_amount), Number(e.vat_amount), Number(e.paid_amount), Number(e.exchange_rate)))),
        };
      });
      return [{
        name: 'Shipment summary',
        columns: [
          { header: 'Shipment ID', key: 'code' }, { header: 'PO', key: 'po' }, { header: 'Supplier', key: 'supplier', width: 28 }, { header: 'Origin', key: 'country' },
          { header: 'Method', key: 'method' }, { header: 'Status', key: 'status' }, { header: 'Invoice date', key: 'date', format: 'date' },
          money('Product invoice SAR', 'invoice'), money('Additional SAR', 'additional'), money('Landed cost SAR', 'landed'), pct('Additional %', 'addPct'), money('Outstanding SAR', 'outstanding'),
        ],
        rows,
        totals: { code: 'TOTAL', ...totalsOf(rows, ['invoice', 'additional', 'landed', 'outstanding']) },
      }];
    },
  },
  {
    id: 'shipment-expenses',
    title: 'Shipment Expense Report',
    description: 'Every expense line with original currency, stored exchange rate, SAR amount, VAT and payment status.',
    orientation: 'landscape',
    build: (ctx) => {
      const rows = ctx.shipments.flatMap((s) =>
        ctx.expensesOf(s.id).map((e) => ({
          code: s.shipment_code, po: s.po_number ?? '', no: e.expense_no, category: e.category?.name ?? '', provider: e.service_provider ?? '', invoice: e.invoice_no ?? '',
          date: e.invoice_date, cur: e.currency_code, orig: Number(e.original_amount), rate: Number(e.exchange_rate), sar: Number(e.amount_sar), vat: Number(e.vat_amount_sar),
          status: PAYMENT_STATUS_LABEL[e.payment_status],
        })),
      );
      return [{
        name: 'Expenses',
        columns: [
          { header: 'Shipment', key: 'code' }, { header: 'PO', key: 'po' }, { header: 'Expense ID', key: 'no' }, { header: 'Category', key: 'category', width: 22 },
          { header: 'Provider', key: 'provider', width: 26 }, { header: 'Invoice no.', key: 'invoice' }, { header: 'Invoice date', key: 'date', format: 'date' },
          { header: 'Currency', key: 'cur' }, { header: 'Original', key: 'orig', format: 'money' }, { header: 'Rate', key: 'rate', format: 'rate' },
          money('Amount SAR', 'sar'), money('VAT SAR', 'vat'), { header: 'Payment', key: 'status' },
        ],
        rows,
        totals: { code: 'TOTAL', ...totalsOf(rows, ['sar', 'vat']) },
      }];
    },
  },
  {
    id: 'expense-percentage',
    title: 'Expense Percentage Report',
    description: 'Each expense category and cost group as a percentage of total landed cost, plus additional cost % over invoice value.',
    orientation: 'portrait',
    build: (ctx) => {
      const all = analyzeShipmentCost(ctx.shipments.flatMap((s) => ctx.expensesOf(s.id)).map(toCalcExpense), { includeLineVat: ctx.data.includeLineVat });
      return [
        {
          name: 'By category',
          columns: [{ header: 'Expense category', key: 'label', width: 30 }, money('Amount SAR', 'amount'), pct('% of landed cost', 'percentage')],
          rows: all.byCategory.map((r) => ({ label: r.label, amount: r.amount, percentage: r.percentage })),
          totals: { label: 'Total landed cost', amount: all.totalLandedCost, percentage: all.totalLandedCost ? 100 : 0 },
        },
        {
          name: 'By cost group',
          columns: [{ header: 'Cost group', key: 'label', width: 30 }, money('Amount SAR', 'amount'), pct('% of landed cost', 'percentage')],
          rows: all.groupRows.map((r) => ({ label: r.label, amount: r.amount, percentage: r.percentage })),
          totals: { label: 'Total', amount: all.totalLandedCost, percentage: all.totalLandedCost ? 100 : 0 },
        },
        {
          name: 'Key ratios',
          columns: [{ header: 'Measure', key: 'm', width: 40 }, { header: 'Value', key: 'v', width: 20 }],
          rows: [
            { m: 'Product invoice value (SAR)', v: all.productInvoiceValue.toFixed(2) },
            { m: 'Additional expense total (SAR)', v: all.additionalExpenseTotal.toFixed(2) },
            { m: 'Additional expense % over invoice value', v: all.additionalExpensePercentage === null ? '—' : `${all.additionalExpensePercentage.toFixed(2)}%` },
            { m: 'Cost increase %', v: all.costIncreasePercentage === null ? '—' : `${all.costIncreasePercentage.toFixed(2)}%` },
            { m: 'Landed cost excl. recoverable VAT (SAR)', v: all.landedCostExclRecoverableVat.toFixed(2) },
            { m: `Service-invoice VAT (SAR, ${all.lineVatIncluded ? 'included' : 'reported separately'})`, v: all.lineVat.toFixed(2) },
          ],
        },
      ];
    },
  },
  {
    id: 'supplier-wise',
    title: 'Supplier-wise Expense Report',
    description: 'Invoice value, each cost group, landed cost and additional cost % per supplier.',
    orientation: 'landscape',
    build: (ctx) => {
      const m = aggregate(ctx, (s) => s.supplier?.name ?? 'No supplier');
      const rows = [...m.entries()].map(([k, a]) => ({ name: k, shipments: a.shipments, invoice: a.invoice, ...groupVals(a), landed: a.landed, additional: a.additional, addPct: a.invoice ? percentOf(a.additional, a.invoice) : '' }));
      return [{
        name: 'By supplier',
        columns: [{ header: 'Supplier', key: 'name', width: 30 }, { header: 'Shipments', key: 'shipments', format: 'int' }, money('Product invoice', 'invoice'), ...groupCols(), money('Additional', 'additional'), money('Landed cost', 'landed'), pct('Additional %', 'addPct')],
        rows,
        totals: { name: 'TOTAL', ...totalsOf(rows, ['shipments', 'invoice', 'additional', 'landed', ...COST_GROUPS.map((g) => `g_${g}`)]) },
      }];
    },
  },
  {
    id: 'forwarder-comparison',
    title: 'Freight Forwarder Comparison',
    description: 'Freight and clearance cost per forwarder, average per shipment and freight as % of invoice value.',
    orientation: 'landscape',
    build: (ctx) => {
      const m = aggregate(ctx, (s) => s.forwarder?.name ?? 'No forwarder');
      const rows = [...m.entries()].map(([k, a]) => ({
        name: k, shipments: a.shipments, invoice: a.invoice, freight: a.groups.freight ?? 0, avgFreight: a.shipments ? (a.groups.freight ?? 0) / a.shipments : 0,
        freightPct: a.invoice ? percentOf(a.groups.freight ?? 0, a.invoice) : '', clearance: a.groups.clearance ?? 0, transport: a.groups.transportation ?? 0, landed: a.landed, addPct: a.invoice ? percentOf(a.additional, a.invoice) : '',
      }));
      return [{
        name: 'By forwarder',
        columns: [{ header: 'Forwarder', key: 'name', width: 30 }, { header: 'Shipments', key: 'shipments', format: 'int' }, money('Product invoice', 'invoice'), money('Freight', 'freight'), money('Avg freight / shipment', 'avgFreight'), pct('Freight % of invoice', 'freightPct'), money('Clearance', 'clearance'), money('Transport', 'transport'), money('Landed cost', 'landed'), pct('Additional %', 'addPct')],
        rows,
        totals: { name: 'TOTAL', ...totalsOf(rows, ['shipments', 'invoice', 'freight', 'clearance', 'transport', 'landed']) },
      }];
    },
  },
  {
    id: 'monthly',
    title: 'Monthly Import Cost Report',
    description: 'Import costs per month (by supplier invoice date): invoice value, cost groups, landed cost and additional %.',
    orientation: 'landscape',
    build: (ctx) => {
      const m = aggregate(ctx, (s) => monthKey(s.supplier_invoice_date ?? s.created_at));
      const rows = [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => ({ month: monthLabel(k), shipments: a.shipments, invoice: a.invoice, ...groupVals(a), landed: a.landed, addPct: a.invoice ? percentOf(a.additional, a.invoice) : '' }));
      return [{
        name: 'By month',
        columns: [{ header: 'Month', key: 'month' }, { header: 'Shipments', key: 'shipments', format: 'int' }, money('Product invoice', 'invoice'), ...groupCols(), money('Landed cost', 'landed'), pct('Additional %', 'addPct')],
        rows,
        totals: { month: 'TOTAL', ...totalsOf(rows, ['shipments', 'invoice', 'landed', ...COST_GROUPS.map((g) => `g_${g}`)]) },
      }];
    },
  },
  {
    id: 'country-wise',
    title: 'Country-wise Import Cost Report',
    description: 'Shipments, invoice value, landed cost and additional % by country of origin.',
    orientation: 'landscape',
    build: (ctx) => {
      const m = aggregate(ctx, (s) => s.country_of_origin || s.supplier?.country || 'Unknown');
      const rows = [...m.entries()].map(([k, a]) => ({ country: k, shipments: a.shipments, invoice: a.invoice, ...groupVals(a), landed: a.landed, addPct: a.invoice ? percentOf(a.additional, a.invoice) : '' }));
      return [{
        name: 'By country',
        columns: [{ header: 'Country', key: 'country', width: 22 }, { header: 'Shipments', key: 'shipments', format: 'int' }, money('Product invoice', 'invoice'), ...groupCols(), money('Landed cost', 'landed'), pct('Additional %', 'addPct')],
        rows,
        totals: { country: 'TOTAL', ...totalsOf(rows, ['shipments', 'invoice', 'landed', ...COST_GROUPS.map((g) => `g_${g}`)]) },
      }];
    },
  },
  {
    id: 'product-landed',
    title: 'Product Landed Cost Report',
    description: 'Landed cost per product line and per unit. Uses the saved allocation; shipments not yet saved are calculated with their default methods (marked “calculated”).',
    orientation: 'landscape',
    build: (ctx) => {
      const rows: Record<string, unknown>[] = [];
      for (const s of ctx.shipments) {
        const prods = ctx.data.products.filter((p) => p.shipment_id === s.id);
        if (!prods.length) continue;
        const saved = ctx.data.allocations.filter((a) => a.shipment_id === s.id);
        const byCat = new Map<string, number>();
        for (const e of ctx.expensesOf(s.id)) {
          const c = ctx.data.categories.find((x) => x.id === e.category_id);
          if (c?.is_allocatable) byCat.set(c.id, (byCat.get(c.id) ?? 0) + toCents(Number(e.amount_sar)));
        }
        const cats: CategoryToAllocate[] = [...byCat.entries()].map(([id, cents]) => {
          const c = ctx.data.categories.find((x) => x.id === id)!;
          const sv = saved.filter((a) => a.category_id === id);
          return { category_id: id, category_name: c.name, amount_sar: cents / 100, method: sv[0]?.method ?? c.default_allocation_method, manualShares: Object.fromEntries(sv.filter((a) => a.method === 'manual').map((a) => [a.shipment_product_id, Number(a.basis_value)])) };
        });
        const res = allocateShipment(prods.map((p) => ({ id: p.id, quantity: Number(p.quantity), invoice_value_sar: Number(p.invoice_value_sar), net_weight: p.net_weight, gross_weight: p.gross_weight })), cats);
        const savedKey = new Set(saved.map((a) => `${a.category_id}|${a.shipment_product_id}|${toCents(Number(a.allocated_amount_sar))}`));
        const isSaved = saved.length > 0 && saved.length === res.rows.length && res.rows.every((r) => savedKey.has(`${r.category_id}|${r.shipment_product_id}|${toCents(r.allocated_amount_sar)}`));
        for (const p of res.products) {
          const src = prods.find((x) => x.id === p.id)!;
          rows.push({
            code: s.shipment_code, item: src.item_code, desc: src.description, qty: p.quantity, uom: src.unit_of_measure, invoice: p.invoice_value_sar, alloc: p.allocated_total,
            landed: p.landed_cost, unit: p.landed_cost_per_unit, uplift: p.uplift_pct, basis: isSaved ? 'saved' : res.issues.length ? 'calculated (incomplete)' : 'calculated',
          });
        }
      }
      return [{
        name: 'Product landed cost',
        columns: [{ header: 'Shipment', key: 'code' }, { header: 'Item code', key: 'item' }, { header: 'Description', key: 'desc', width: 32 }, { header: 'Qty', key: 'qty', format: 'num' }, { header: 'UoM', key: 'uom' }, money('Invoice SAR', 'invoice'), money('Allocated SAR', 'alloc'), money('Landed SAR', 'landed'), { header: 'Per unit SAR', key: 'unit', format: 'num' }, pct('Uplift %', 'uplift'), { header: 'Basis', key: 'basis' }],
        rows,
        totals: { code: 'TOTAL', ...totalsOf(rows, ['invoice', 'alloc', 'landed']) },
      }];
    },
  },
  {
    id: 'unpaid',
    title: 'Unpaid Expenses Report',
    description: 'Unpaid and partially paid expenses with outstanding amount in SAR and age in days.',
    orientation: 'landscape',
    build: (ctx) => {
      const today = new Date(todayISO()).getTime();
      const rows = ctx.shipments.flatMap((s) =>
        ctx.expensesOf(s.id)
          .filter((e) => e.payment_status !== 'paid')
          .map((e) => ({
            code: s.shipment_code, po: s.po_number ?? '', no: e.expense_no, category: e.category?.name ?? '', provider: e.service_provider ?? '', invoice: e.invoice_no ?? '', date: e.invoice_date,
            cur: e.currency_code, payable: sumMoney([Number(e.original_amount), Number(e.vat_amount)]), paid: Number(e.paid_amount),
            outstanding: outstandingSar(Number(e.original_amount), Number(e.vat_amount), Number(e.paid_amount), Number(e.exchange_rate)),
            age: e.invoice_date ? Math.max(0, Math.round((today - new Date(e.invoice_date).getTime()) / 86400000)) : '', status: PAYMENT_STATUS_LABEL[e.payment_status],
          })),
      );
      return [{
        name: 'Unpaid expenses',
        columns: [{ header: 'Shipment', key: 'code' }, { header: 'PO', key: 'po' }, { header: 'Expense ID', key: 'no' }, { header: 'Category', key: 'category', width: 22 }, { header: 'Provider', key: 'provider', width: 26 }, { header: 'Invoice no.', key: 'invoice' }, { header: 'Invoice date', key: 'date', format: 'date' }, { header: 'Currency', key: 'cur' }, { header: 'Payable', key: 'payable', format: 'money' }, { header: 'Paid', key: 'paid', format: 'money' }, money('Outstanding SAR', 'outstanding'), { header: 'Age (days)', key: 'age', format: 'int' }, { header: 'Status', key: 'status' }],
        rows,
        totals: { code: 'TOTAL', outstanding: sumMoney(rows.map((r) => r.outstanding)) },
      }];
    },
  },
  {
    id: 'shipment-comparison',
    title: 'Shipment Comparison Report',
    description: 'Side-by-side cost structure of shipments: each cost group in SAR and as % of landed cost.',
    orientation: 'landscape',
    build: (ctx) => {
      const rows = ctx.shipments.map((s) => {
        const a = ctx.analyses.get(s.id)!;
        return {
          code: s.shipment_code, supplier: s.supplier?.name ?? '', invoice: a.productInvoiceValue, ...groupVals(a),
          ...Object.fromEntries(COST_GROUPS.filter((g) => g !== 'product_invoice').map((g) => [`p_${g}`, percentOf(a.byGroup[g], a.totalLandedCost)])),
          landed: a.totalLandedCost, addPct: a.additionalExpensePercentage ?? '',
        };
      });
      return [{
        name: 'Shipment comparison',
        columns: [
          { header: 'Shipment', key: 'code' }, { header: 'Supplier', key: 'supplier', width: 24 }, money('Product invoice', 'invoice'), ...groupCols(),
          ...COST_GROUPS.filter((g) => g !== 'product_invoice').map((g) => pct(`${COST_GROUP_LABELS[g]} %`, `p_${g}`)),
          money('Landed cost', 'landed'), pct('Additional %', 'addPct'),
        ],
        rows,
        totals: { code: 'TOTAL', ...totalsOf(rows, ['invoice', 'landed', ...COST_GROUPS.map((g) => `g_${g}`)]) },
      }];
    },
  },
];

export function filterLabels(f: ReportFilters, data: ReportData): string[] {
  const out: string[] = [];
  out.push(f.from || f.to ? `Period (supplier invoice date): ${f.from || '…'} to ${f.to || '…'}` : 'Period: all dates');
  if (f.supplierId) out.push(`Supplier: ${data.suppliers.find((s) => s.id === f.supplierId)?.name ?? ''}`);
  if (f.shipmentId) out.push(`Shipment: ${data.shipments.find((s) => s.id === f.shipmentId)?.shipment_code ?? ''}`);
  out.push(f.includeCancelled ? 'Cancelled shipments included' : 'Cancelled and archived shipments excluded');
  return out;
}
