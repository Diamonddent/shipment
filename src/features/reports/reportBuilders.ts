/**
 * Report definitions. Each builder turns raw rows into export tables using
 * the tested calculations in src/lib/calculations.ts.
 */
import {
  COST_GROUPS, COST_GROUP_LABELS, analyzeShipmentCost, outstandingSar, percentOf, sumMoney,
  type ShipmentCostAnalysis,
} from '@/lib/calculations';
import { PAYMENT_STATUS_LABEL, SHIPMENT_STATUS_LABEL, SHIPPING_METHOD_LABEL } from '@/lib/constants';
import type { ExportColumn, ExportTable } from '@/lib/export';
import { toCalcExpense } from '@/hooks/queries';
import { inRange, todayISO } from '@/lib/utils';
import { monthKey, monthLabel } from '@/lib/format';
import type {
  ExpenseCategory, ExpenseWithRefs, FreightForwarder, ShipmentWithRefs, Supplier,
} from '@/types/database';

export interface ReportData {
  shipments: ShipmentWithRefs[];
  expenses: ExpenseWithRefs[];
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
  additional: number;
}
function aggregate(ctx: ReportContext, keyOf: (s: ShipmentWithRefs) => string): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const s of ctx.shipments) {
    const a = ctx.analyses.get(s.id)!;
    const k = keyOf(s);
    const cur = m.get(k) ?? { shipments: 0, invoice: 0, groups: {}, additional: 0 };
    cur.shipments += 1;
    cur.invoice = sumMoney([cur.invoice, a.productInvoiceValue]);
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
    description: 'One line per shipment: supplier, route, status, supplier invoice value, expenses, total expenses, expense % of invoice and outstanding payments.',
    orientation: 'landscape',
    build: (ctx) => {
      const rows = ctx.shipments.map((s) => {
        const a = ctx.analyses.get(s.id)!;
        const exps = ctx.expensesOf(s.id);
        return {
          code: s.shipment_code, po: s.po_number ?? '', supplier: s.supplier?.name ?? '', country: s.country_of_origin ?? '',
          method: s.shipping_method ? SHIPPING_METHOD_LABEL[s.shipping_method] : '', status: SHIPMENT_STATUS_LABEL[s.status], date: s.supplier_invoice_date,
          invoice: a.productInvoiceValue, additional: a.additionalExpenseTotal, addPct: a.additionalExpensePercentage ?? '',
          outstanding: sumMoney(exps.map((e) => outstandingSar(Number(e.original_amount), Number(e.vat_amount), Number(e.paid_amount), Number(e.exchange_rate)))),
        };
      });
      return [{
        name: 'Shipment summary',
        columns: [
          { header: 'Shipment ID', key: 'code' }, { header: 'PO', key: 'po' }, { header: 'Supplier', key: 'supplier', width: 28 }, { header: 'Origin', key: 'country' },
          { header: 'Method', key: 'method' }, { header: 'Status', key: 'status' }, { header: 'Invoice date', key: 'date', format: 'date' },
          money('Supplier invoice SAR', 'invoice'), money('Total expenses SAR', 'additional'), pct('Expenses % of invoice', 'addPct'), money('Outstanding SAR', 'outstanding'),
        ],
        rows,
        totals: { code: 'TOTAL', ...totalsOf(rows, ['invoice', 'additional', 'outstanding']) },
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
    title: 'Expense % of Supplier Invoice',
    description: 'Each expense category and cost group as a percentage of the supplier invoice value, with the total expense %.',
    orientation: 'portrait',
    build: (ctx) => {
      const all = analyzeShipmentCost(ctx.shipments.flatMap((s) => ctx.expensesOf(s.id)).map(toCalcExpense), { includeLineVat: ctx.data.includeLineVat });
      const exp = (rows: typeof all.byCategory) => rows.filter((r) => r.group !== 'product_invoice').map((r) => ({ label: r.label, amount: r.amount, pctInv: r.pctOfInvoice ?? '' }));
      const totals = { label: 'Total expenses', amount: all.additionalExpenseTotal, pctInv: all.additionalExpensePercentage ?? '' };
      return [
        {
          name: 'By category',
          columns: [{ header: 'Expense category', key: 'label', width: 30 }, money('Amount SAR', 'amount'), pct('% of supplier invoice', 'pctInv')],
          rows: exp(all.byCategory),
          totals,
        },
        {
          name: 'By cost group',
          columns: [{ header: 'Cost group', key: 'label', width: 30 }, money('Amount SAR', 'amount'), pct('% of supplier invoice', 'pctInv')],
          rows: exp(all.groupRows),
          totals,
        },
        {
          name: 'Key ratios',
          columns: [{ header: 'Measure', key: 'm', width: 40 }, { header: 'Value', key: 'v', width: 20 }],
          rows: [
            { m: 'Supplier invoice value (SAR)', v: all.productInvoiceValue.toFixed(2) },
            { m: 'Total expenses (SAR)', v: all.additionalExpenseTotal.toFixed(2) },
            { m: 'Expenses % of supplier invoice', v: all.additionalExpensePercentage === null ? '—' : `${all.additionalExpensePercentage.toFixed(2)}%` },
            { m: `Service-invoice VAT (SAR, ${all.lineVatIncluded ? 'included' : 'reported separately'})`, v: all.lineVat.toFixed(2) },
          ],
        },
      ];
    },
  },
  {
    id: 'supplier-wise',
    title: 'Supplier-wise Expense Report',
    description: 'Invoice value, each cost group, total expenses and expense % of invoice per supplier.',
    orientation: 'landscape',
    build: (ctx) => {
      const m = aggregate(ctx, (s) => s.supplier?.name ?? 'No supplier');
      const rows = [...m.entries()].map(([k, a]) => ({ name: k, shipments: a.shipments, invoice: a.invoice, ...groupVals(a), additional: a.additional, addPct: a.invoice ? percentOf(a.additional, a.invoice) : '' }));
      return [{
        name: 'By supplier',
        columns: [{ header: 'Supplier', key: 'name', width: 30 }, { header: 'Shipments', key: 'shipments', format: 'int' }, money('Supplier invoice', 'invoice'), ...groupCols(), money('Total expenses', 'additional'), pct('Expenses % of invoice', 'addPct')],
        rows,
        totals: { name: 'TOTAL', ...totalsOf(rows, ['shipments', 'invoice', 'additional', ...COST_GROUPS.map((g) => `g_${g}`)]) },
      }];
    },
  },
  {
    id: 'forwarder-comparison',
    title: 'Freight Forwarder Comparison',
    description: 'Freight and clearance cost per forwarder, average per shipment and freight as % of supplier invoice.',
    orientation: 'landscape',
    build: (ctx) => {
      const m = aggregate(ctx, (s) => s.forwarder?.name ?? 'No forwarder');
      const rows = [...m.entries()].map(([k, a]) => ({
        name: k, shipments: a.shipments, invoice: a.invoice, freight: a.groups.freight ?? 0, avgFreight: a.shipments ? (a.groups.freight ?? 0) / a.shipments : 0,
        freightPct: a.invoice ? percentOf(a.groups.freight ?? 0, a.invoice) : '', clearance: a.groups.clearance ?? 0, transport: a.groups.transportation ?? 0, additional: a.additional, addPct: a.invoice ? percentOf(a.additional, a.invoice) : '',
      }));
      return [{
        name: 'By forwarder',
        columns: [{ header: 'Forwarder', key: 'name', width: 30 }, { header: 'Shipments', key: 'shipments', format: 'int' }, money('Supplier invoice', 'invoice'), money('Freight', 'freight'), money('Avg freight / shipment', 'avgFreight'), pct('Freight % of invoice', 'freightPct'), money('Clearance', 'clearance'), money('Transport', 'transport'), money('Total expenses', 'additional'), pct('Expenses % of invoice', 'addPct')],
        rows,
        totals: { name: 'TOTAL', ...totalsOf(rows, ['shipments', 'invoice', 'freight', 'clearance', 'transport', 'additional']) },
      }];
    },
  },
  {
    id: 'monthly',
    title: 'Monthly Import Cost Report',
    description: 'Import costs per month (by supplier invoice date): invoice value, cost groups, total expenses and expense % of invoice.',
    orientation: 'landscape',
    build: (ctx) => {
      const m = aggregate(ctx, (s) => monthKey(s.supplier_invoice_date ?? s.created_at));
      const rows = [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => ({ month: monthLabel(k), shipments: a.shipments, invoice: a.invoice, ...groupVals(a), additional: a.additional, addPct: a.invoice ? percentOf(a.additional, a.invoice) : '' }));
      return [{
        name: 'By month',
        columns: [{ header: 'Month', key: 'month' }, { header: 'Shipments', key: 'shipments', format: 'int' }, money('Supplier invoice', 'invoice'), ...groupCols(), money('Total expenses', 'additional'), pct('Expenses % of invoice', 'addPct')],
        rows,
        totals: { month: 'TOTAL', ...totalsOf(rows, ['shipments', 'invoice', 'additional', ...COST_GROUPS.map((g) => `g_${g}`)]) },
      }];
    },
  },
  {
    id: 'country-wise',
    title: 'Country-wise Import Cost Report',
    description: 'Shipments, invoice value, total expenses and expense % of invoice by country of origin.',
    orientation: 'landscape',
    build: (ctx) => {
      const m = aggregate(ctx, (s) => s.country_of_origin || s.supplier?.country || 'Unknown');
      const rows = [...m.entries()].map(([k, a]) => ({ country: k, shipments: a.shipments, invoice: a.invoice, ...groupVals(a), additional: a.additional, addPct: a.invoice ? percentOf(a.additional, a.invoice) : '' }));
      return [{
        name: 'By country',
        columns: [{ header: 'Country', key: 'country', width: 22 }, { header: 'Shipments', key: 'shipments', format: 'int' }, money('Supplier invoice', 'invoice'), ...groupCols(), money('Total expenses', 'additional'), pct('Expenses % of invoice', 'addPct')],
        rows,
        totals: { country: 'TOTAL', ...totalsOf(rows, ['shipments', 'invoice', 'additional', ...COST_GROUPS.map((g) => `g_${g}`)]) },
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
          .filter((e) => e.payment_status === 'unpaid' || e.payment_status === 'partially_paid')
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
    description: 'Side-by-side cost structure of shipments: each cost group in SAR and as % of the supplier invoice.',
    orientation: 'landscape',
    build: (ctx) => {
      const rows = ctx.shipments.map((s) => {
        const a = ctx.analyses.get(s.id)!;
        return {
          code: s.shipment_code, supplier: s.supplier?.name ?? '', invoice: a.productInvoiceValue, ...groupVals(a),
          ...Object.fromEntries(COST_GROUPS.filter((g) => g !== 'product_invoice').map((g) => [`p_${g}`, a.productInvoiceValue ? percentOf(a.byGroup[g], a.productInvoiceValue) : ''])),
          additional: a.additionalExpenseTotal, addPct: a.additionalExpensePercentage ?? '',
        };
      });
      return [{
        name: 'Shipment comparison',
        columns: [
          { header: 'Shipment', key: 'code' }, { header: 'Supplier', key: 'supplier', width: 24 }, money('Supplier invoice', 'invoice'), ...groupCols(),
          ...COST_GROUPS.filter((g) => g !== 'product_invoice').map((g) => pct(`${COST_GROUP_LABELS[g]} % of inv.`, `p_${g}`)),
          money('Total expenses', 'additional'), pct('Expenses % of invoice', 'addPct'),
        ],
        rows,
        totals: { code: 'TOTAL', ...totalsOf(rows, ['invoice', 'additional', ...COST_GROUPS.map((g) => `g_${g}`)]) },
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
