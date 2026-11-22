/**
 * Financial calculations for Shipment Cost Control & Analysis.
 *
 * Every number shown on the dashboard, shipment pages and reports comes from the pure functions in this file. They are unit-tested
 * in calculations.test.ts. The SQL view v_shipment_cost_summary implements the
 * same formula (expenses as % of supplier invoice) for database-side reporting / ERP integration.
 *
 * Money is handled in integer halalas (1/100 SAR) wherever sums are produced, so totals always reconcile to 2 decimals.
 */

export type CostGroup =
  | 'product_invoice'
  | 'freight'
  | 'insurance'
  | 'customs_duty'
  | 'import_vat'
  | 'clearance'
  | 'transportation'
  | 'other';

export const COST_GROUPS: CostGroup[] = [
  'product_invoice',
  'freight',
  'insurance',
  'customs_duty',
  'import_vat',
  'clearance',
  'transportation',
  'other',
];

export const COST_GROUP_LABELS: Record<CostGroup, string> = {
  product_invoice: 'Supplier Invoice',
  freight: 'Freight',
  insurance: 'Insurance',
  customs_duty: 'Customs Duty',
  import_vat: 'VAT',
  clearance: 'Clearance',
  transportation: 'Transportation',
  other: 'Other Expenses',
};

// ---------------------------------------------------------------------------
// Rounding helpers
// ---------------------------------------------------------------------------

/** Converts a decimal amount to integer cents (halalas), rounding half away from zero. */
export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = Number((Math.abs(value) * 100).toPrecision(15));
  return Math.sign(value) * Math.round(scaled);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Rounds to 2 decimals, half away from zero (matches PostgreSQL round(numeric, 2)). */
export function round2(value: number): number {
  return fromCents(toCents(value));
}

/** Rounds to n decimals, half away from zero. */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  const scaled = Number((Math.abs(value) * f).toPrecision(15));
  return (Math.sign(value) * Math.round(scaled)) / f;
}

/** Sum of amounts computed in cents to avoid floating point drift. */
export function sumMoney(values: Array<number | null | undefined>): number {
  return fromCents(values.reduce<number>((acc, v) => acc + toCents(Number(v ?? 0)), 0));
}

/** Amount in SAR = Original Amount × Exchange Rate (rounded to 2 decimals). */
export function toSar(originalAmount: number, exchangeRate: number): number {
  return round2(Number(originalAmount) * Number(exchangeRate));
}

/** (part / total) × 100, rounded to `decimals`. Returns 0 when total is 0. */
export function percentOf(part: number, total: number, decimals = 2): number {
  if (!total) return 0;
  return roundTo((part / total) * 100, decimals);
}

// ---------------------------------------------------------------------------
// Shipment cost analysis
// ---------------------------------------------------------------------------

export interface ExpenseForCalc {
  category_id: string;
  category_name: string;
  cost_group: CostGroup;
  amount_sar: number;
  /** VAT on a service invoice (informational, SAR). Not added unless includeLineVat. */
  vat_amount_sar?: number | null;
  is_recoverable_vat?: boolean;
  is_deleted?: boolean;
}

export interface CostRow {
  key: string;
  label: string;
  group: CostGroup;
  amount: number;
  /** Share of total expenses (supplier invoice excluded; supplier invoice row = 0) */
  percentage: number;
  /** % of Supplier Invoice = (Expense Amount / Supplier Invoice Value) × 100 (null when no supplier invoice) */
  pctOfInvoice: number | null;
}

export interface ShipmentCostAnalysis {
  byGroup: Record<CostGroup, number>;
  byCategory: CostRow[];
  groupRows: CostRow[];
  productInvoiceValue: number;
  /** Total Expenses = sum of every expense except the supplier invoice (+ line VAT when the setting is on) */
  additionalExpenseTotal: number;
  /** Expenses % of supplier invoice = (Total Expenses / Supplier Invoice Value) × 100 (null if no invoice) */
  additionalExpensePercentage: number | null;
  /** Recoverable input VAT (Import VAT category) included in total expenses */
  recoverableVat: number;
  /** Sum of VAT amounts entered on service invoices (reported separately) */
  lineVat: number;
  /** True when line VAT was added to the total (setting) */
  lineVatIncluded: boolean;
  expenseCount: number;
}

export interface CostOptions {
  /** Setting include_line_vat_in_expenses: add per-line VAT amounts to total expenses. Default false. */
  includeLineVat?: boolean;
}

function emptyGroups(): Record<CostGroup, number> {
  return {
    product_invoice: 0,
    freight: 0,
    insurance: 0,
    customs_duty: 0,
    import_vat: 0,
    clearance: 0,
    transportation: 0,
    other: 0,
  };
}

/**
 * Total Expenses = Freight + Insurance + Customs Duty + Import VAT + Clearance + Transportation + Other
 * Expenses % of Supplier Invoice = Total Expenses / Supplier Invoice × 100
 *
 * The supplier invoice is the base, never part of total expenses. The per-line
 * `vat_amount_sar` on service invoices is informational and only added when
 * `includeLineVat` is set — so VAT is never counted twice.
 */
export function analyzeShipmentCost(expenses: ExpenseForCalc[], options: CostOptions = {}): ShipmentCostAnalysis {
  const includeLineVat = options.includeLineVat ?? false;
  const active = expenses.filter((e) => !e.is_deleted);
  const groupCents = emptyGroups();
  const catCents = new Map<string, { label: string; cents: number; group: CostGroup }>();
  let recoverableCents = 0;
  let lineVatCents = 0;

  for (const e of active) {
    const c = toCents(Number(e.amount_sar) || 0);
    groupCents[e.cost_group] += c;
    const prev = catCents.get(e.category_id);
    catCents.set(e.category_id, { label: e.category_name, cents: (prev?.cents ?? 0) + c, group: e.cost_group });
    if (e.is_recoverable_vat) recoverableCents += c;
    lineVatCents += toCents(Number(e.vat_amount_sar) || 0);
  }

  const lineVatAdded = includeLineVat ? lineVatCents : 0;
  if (lineVatAdded) {
    // line VAT is treated as recoverable input VAT, grouped under VAT
    groupCents.import_vat += lineVatAdded;
    catCents.set('__line_vat__', { label: 'VAT on service invoices', cents: lineVatAdded, group: 'import_vat' });
  }

  const totalCents = COST_GROUPS.reduce((a, g) => a + groupCents[g], 0);
  const productInvoiceValue = fromCents(groupCents.product_invoice);
  const additionalExpenseTotal = fromCents(totalCents - groupCents.product_invoice);
  const shareOf = (g: CostGroup, amt: number) => (g === 'product_invoice' ? 0 : percentOf(amt, additionalExpenseTotal));
  const additionalPct = productInvoiceValue > 0 ? percentOf(additionalExpenseTotal, productInvoiceValue) : null;

  const byGroup = emptyGroups();
  for (const g of COST_GROUPS) byGroup[g] = fromCents(groupCents[g]);

  const groupRows: CostRow[] = COST_GROUPS.filter((g) => groupCents[g] !== 0).map((g) => ({
    key: g,
    label: COST_GROUP_LABELS[g],
    group: g,
    amount: byGroup[g],
    percentage: shareOf(g, byGroup[g]),
    pctOfInvoice: productInvoiceValue > 0 ? percentOf(byGroup[g], productInvoiceValue) : null,
  }));

  const byCategory: CostRow[] = [...catCents.entries()]
    .filter(([, v]) => v.cents !== 0)
    .sort(([, a], [, b]) => COST_GROUPS.indexOf(a.group) - COST_GROUPS.indexOf(b.group) || b.cents - a.cents)
    .map(([key, v]) => ({
      key,
      label: v.label,
      group: v.group,
      amount: fromCents(v.cents),
      percentage: shareOf(v.group, fromCents(v.cents)),
      pctOfInvoice: productInvoiceValue > 0 ? percentOf(fromCents(v.cents), productInvoiceValue) : null,
    }));

  return {
    byGroup,
    byCategory,
    groupRows,
    productInvoiceValue,
    additionalExpenseTotal,
    additionalExpensePercentage: additionalPct,
    recoverableVat: fromCents(recoverableCents),
    lineVat: fromCents(lineVatCents),
    lineVatIncluded: includeLineVat,
    expenseCount: active.length,
  };
}

/** Percentages that are displayed together and must add up to exactly 100.00 (largest remainder). */
export function reconciledPercentages(amounts: number[], decimals = 2): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (!total) return amounts.map(() => 0);
  const unit = 10 ** decimals;
  const res = largestRemainder(100 * unit, amounts.map((a) => Math.max(0, a)));
  return res.map((r) => r / unit);
}

// ---------------------------------------------------------------------------
// Apportionment helper (used to make displayed percentages total 100.00)
// ---------------------------------------------------------------------------

/** Largest-remainder apportionment of an integer total across weights; result sums exactly to totalUnits. */
export function largestRemainder(totalUnits: number, weights: number[]): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const W = w.reduce((a, b) => a + b, 0);
  if (W <= 0) return w.map(() => 0);
  const sign = totalUnits < 0 ? -1 : 1;
  const T = Math.abs(Math.round(totalUnits));
  const raw = w.map((x) => (T * x) / W);
  const floors = raw.map((r) => Math.floor(r + 1e-9));
  let remainder = T - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i], weight: w[i] }))
    .filter((o) => o.weight > 0)
    .sort((a, b) => b.frac - a.frac || b.weight - a.weight || a.i - b.i);
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    floors[order[k % order.length].i] += 1;
    remainder -= 1;
    k += 1;
  }
  return floors.map((f) => f * sign);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'not_applicable';

/** Total payable on an expense line = original amount + service-invoice VAT (same currency). */
export function expensePayable(originalAmount: number, vatAmount: number | null | undefined): number {
  return sumMoney([originalAmount, vatAmount ?? 0]);
}

export function derivePaymentStatus(paid: number, payable: number): PaymentStatus {
  const p = toCents(paid);
  const t = toCents(payable);
  if (p <= 0) return 'unpaid';
  if (p >= t) return 'paid';
  return 'partially_paid';
}

/** Outstanding amount in SAR at the expense's stored rate. */
export function outstandingSar(originalAmount: number, vatAmount: number, paidAmount: number, exchangeRate: number): number {
  const remaining = sumMoney([originalAmount, vatAmount, -paidAmount]);
  return remaining > 0 ? toSar(remaining, exchangeRate) : 0;
}

// ---------------------------------------------------------------------------
// Portfolio summaries (dashboard / reports)
// ---------------------------------------------------------------------------

export type ShipmentStatus =
  | 'draft'
  | 'preparing'
  | 'in_transit'
  | 'arrived'
  | 'customs_clearance'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export const PENDING_STATUSES: ShipmentStatus[] = ['draft', 'preparing', 'in_transit', 'arrived', 'customs_clearance', 'delivered'];

export interface ShipmentForSummary {
  id: string;
  status: ShipmentStatus;
  is_archived?: boolean;
  expenses: Array<ExpenseForCalc & { payment_status?: PaymentStatus; outstanding_sar?: number }>;
}

export interface PortfolioSummary {
  totalShipments: number;
  productInvoiceValue: number;
  freight: number;
  customsDuty: number;
  vat: number;
  additionalExpenses: number;
  /** Mean of per-shipment Additional Expense % (shipments with a supplier invoice only) */
  averageAdditionalPct: number | null;
  /** Portfolio-weighted additional % = total additional / total invoice */
  weightedAdditionalPct: number | null;
  pendingShipments: number;
  completedShipments: number;
  unpaidExpenseCount: number;
  unpaidExpenseAmount: number;
  byGroup: Record<CostGroup, number>;
  perShipment: Map<string, ShipmentCostAnalysis>;
}

/** Cancelled (and archived) shipments are excluded unless explicitly requested. */
export function summarizePortfolio(
  shipments: ShipmentForSummary[],
  options: CostOptions & { includeCancelled?: boolean; includeArchived?: boolean } = {},
): PortfolioSummary {
  const list = shipments.filter(
    (s) => (options.includeCancelled || s.status !== 'cancelled') && (options.includeArchived || !s.is_archived),
  );
  const byGroupCents = emptyGroups();
  const perShipment = new Map<string, ShipmentCostAnalysis>();
  let additionalCents = 0;
  let unpaidCount = 0;
  let unpaidCents = 0;
  const pcts: number[] = [];

  for (const s of list) {
    const a = analyzeShipmentCost(s.expenses, options);
    perShipment.set(s.id, a);
    for (const g of COST_GROUPS) byGroupCents[g] += toCents(a.byGroup[g]);
    additionalCents += toCents(a.additionalExpenseTotal);
    if (a.additionalExpensePercentage !== null) pcts.push(a.additionalExpensePercentage);
    for (const e of s.expenses) {
      if (e.is_deleted) continue;
      if (e.cost_group === 'product_invoice') continue; // supplier invoice has no payment status
      if (e.payment_status && e.payment_status !== 'paid' && e.payment_status !== 'not_applicable') {
        unpaidCount += 1;
        unpaidCents += toCents(e.outstanding_sar ?? e.amount_sar);
      }
    }
  }
  const byGroup = emptyGroups();
  for (const g of COST_GROUPS) byGroup[g] = fromCents(byGroupCents[g]);
  return {
    totalShipments: list.length,
    productInvoiceValue: byGroup.product_invoice,
    freight: byGroup.freight,
    customsDuty: byGroup.customs_duty,
    vat: byGroup.import_vat,
    additionalExpenses: fromCents(additionalCents),
    averageAdditionalPct: pcts.length ? roundTo(pcts.reduce((a, b) => a + b, 0) / pcts.length, 2) : null,
    weightedAdditionalPct: byGroupCents.product_invoice > 0 ? percentOf(additionalCents, byGroupCents.product_invoice) : null,
    pendingShipments: list.filter((s) => PENDING_STATUSES.includes(s.status)).length,
    completedShipments: list.filter((s) => s.status === 'completed').length,
    unpaidExpenseCount: unpaidCount,
    unpaidExpenseAmount: fromCents(unpaidCents),
    byGroup,
    perShipment,
  };
}
