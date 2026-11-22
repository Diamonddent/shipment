/**
 * Financial calculations for Shipment Cost Control & Analysis.
 *
 * Every number shown on the dashboard, shipment pages, landed-cost calculator
 * and reports comes from the pure functions in this file. They are unit-tested
 * in calculations.test.ts. The SQL view v_shipment_cost_summary implements the
 * same landed-cost formula for database-side reporting / ERP integration.
 *
 * Money is handled in integer halalas (1/100 SAR) wherever sums or
 * allocations are produced, so totals always reconcile to 2 decimals.
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
  product_invoice: 'Product Invoice',
  freight: 'Freight',
  insurance: 'Insurance',
  customs_duty: 'Customs Duty',
  import_vat: 'VAT',
  clearance: 'Clearance',
  transportation: 'Transportation',
  other: 'Other Expenses',
};

export type AllocationMethod = 'value' | 'quantity' | 'net_weight' | 'gross_weight' | 'manual';

export const ALLOCATION_METHOD_LABELS: Record<AllocationMethod, string> = {
  value: 'By product value',
  quantity: 'By quantity',
  net_weight: 'By net weight',
  gross_weight: 'By gross weight',
  manual: 'Manual (%)',
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

/** Product Invoice Value = Quantity × Unit Price × Exchange Rate. */
export function productInvoiceValueSar(quantity: number, unitPrice: number, exchangeRate: number): number {
  return round2(Number(quantity) * Number(unitPrice) * Number(exchangeRate));
}

/** Product invoice value in its own currency = Quantity × Unit Price. */
export function productInvoiceValue(quantity: number, unitPrice: number): number {
  return round2(Number(quantity) * Number(unitPrice));
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
  amount: number;
  /** Expense Percentage = (Individual Expense Amount / Total Landed Cost) × 100 */
  percentage: number;
}

export interface ShipmentCostAnalysis {
  byGroup: Record<CostGroup, number>;
  byCategory: CostRow[];
  groupRows: CostRow[];
  productInvoiceValue: number;
  totalLandedCost: number;
  /** Additional Expense Total = Total Landed Cost − Product Invoice Value */
  additionalExpenseTotal: number;
  /** Additional Expense % = (Additional Expense Total / Product Invoice Value) × 100 (null if no invoice) */
  additionalExpensePercentage: number | null;
  /** Cost Increase % = ((Total Landed Cost − Product Invoice Value) / Product Invoice Value) × 100 */
  costIncreasePercentage: number | null;
  /** Recoverable input VAT (Import VAT category) included in the total */
  recoverableVat: number;
  /** Total landed cost excluding recoverable VAT (Import VAT and, if included, service-invoice VAT) */
  landedCostExclRecoverableVat: number;
  /** Sum of VAT amounts entered on service invoices (reported separately) */
  lineVat: number;
  /** True when line VAT was added to the total (setting) */
  lineVatIncluded: boolean;
  expenseCount: number;
}

export interface CostOptions {
  /** Setting include_line_vat_in_landed_cost: add per-line VAT amounts to landed cost. Default false. */
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
 * Total Landed Cost = Product Invoice + Freight + Insurance + Customs Duty
 *                     + Import VAT + Clearance + Transportation + Other
 *
 * Import VAT is its own category and is included in the total (as the spec
 * formula requires). The per-line `vat_amount_sar` on service invoices is
 * informational and reported separately; it is only added when
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
  const totalLandedCost = fromCents(totalCents);
  const productInvoiceValue = fromCents(groupCents.product_invoice);
  const additionalExpenseTotal = fromCents(totalCents - groupCents.product_invoice);
  const additionalPct = productInvoiceValue > 0 ? percentOf(additionalExpenseTotal, productInvoiceValue) : null;

  const byGroup = emptyGroups();
  for (const g of COST_GROUPS) byGroup[g] = fromCents(groupCents[g]);

  const groupRows: CostRow[] = COST_GROUPS.filter((g) => groupCents[g] !== 0).map((g) => ({
    key: g,
    label: COST_GROUP_LABELS[g],
    amount: byGroup[g],
    percentage: percentOf(byGroup[g], totalLandedCost),
  }));

  const byCategory: CostRow[] = [...catCents.entries()]
    .filter(([, v]) => v.cents !== 0)
    .sort(([, a], [, b]) => COST_GROUPS.indexOf(a.group) - COST_GROUPS.indexOf(b.group) || b.cents - a.cents)
    .map(([key, v]) => ({
      key,
      label: v.label,
      amount: fromCents(v.cents),
      percentage: percentOf(fromCents(v.cents), totalLandedCost),
    }));

  return {
    byGroup,
    byCategory,
    groupRows,
    productInvoiceValue,
    totalLandedCost,
    additionalExpenseTotal,
    additionalExpensePercentage: additionalPct,
    costIncreasePercentage: additionalPct,
    recoverableVat: fromCents(recoverableCents),
    landedCostExclRecoverableVat: fromCents(totalCents - recoverableCents - lineVatAdded),
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
// Allocation
// ---------------------------------------------------------------------------

/**
 * Largest-remainder apportionment of an integer total across weights.
 * Returns integers that sum exactly to `totalUnits`. Zero weights get 0.
 * Throws if all weights are zero (caller decides on fallback).
 */
export function largestRemainder(totalUnits: number, weights: number[]): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const W = w.reduce((a, b) => a + b, 0);
  if (W <= 0) throw new AllocationError('ZERO_BASIS', 'The allocation basis is zero for every product');
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

export class AllocationError extends Error {
  code: 'ZERO_BASIS' | 'MANUAL_NOT_100' | 'NO_PRODUCTS';
  constructor(code: AllocationError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'AllocationError';
  }
}

/** Allocates `amount` (SAR) across `bases` proportionally; result sums exactly to round2(amount). */
export function allocateAmount(amount: number, bases: number[]): number[] {
  if (bases.length === 0) throw new AllocationError('NO_PRODUCTS', 'There are no products to allocate to');
  return largestRemainder(toCents(amount), bases).map(fromCents);
}

export interface ProductForAllocation {
  id: string;
  label?: string;
  quantity: number;
  invoice_value_sar: number;
  net_weight?: number | null;
  gross_weight?: number | null;
}

export function basisFor(method: Exclude<AllocationMethod, 'manual'>, p: ProductForAllocation): number {
  switch (method) {
    case 'value':
      return Number(p.invoice_value_sar) || 0;
    case 'quantity':
      return Number(p.quantity) || 0;
    case 'net_weight':
      return Number(p.net_weight) || 0;
    case 'gross_weight':
      return Number(p.gross_weight) || 0;
  }
}

export interface CategoryToAllocate {
  category_id: string;
  category_name: string;
  amount_sar: number;
  method: AllocationMethod;
  /** Manual shares in percent keyed by product id (must total 100). */
  manualShares?: Record<string, number>;
}

export interface AllocationRow {
  category_id: string;
  shipment_product_id: string;
  method: AllocationMethod;
  basis_value: number;
  allocated_amount_sar: number;
}

export interface ProductLandedCost {
  id: string;
  label?: string;
  quantity: number;
  invoice_value_sar: number;
  allocated_by_category: Record<string, number>;
  allocated_total: number;
  /** Landed Cost per Product = Product Invoice Value + Allocated Expenses */
  landed_cost: number;
  /** Landed Cost per Unit = Product Landed Cost / Quantity */
  landed_cost_per_unit: number;
  /** share of the shipment's total landed cost (%) */
  share_pct: number;
  uplift_pct: number;
}

export interface CategoryAllocationIssue {
  category_id: string;
  category_name: string;
  code: AllocationError['code'];
  message: string;
}

export interface AllocationResult {
  rows: AllocationRow[];
  products: ProductLandedCost[];
  issues: CategoryAllocationIssue[];
  totalAllocated: number;
  totalToAllocate: number;
  reconciled: boolean;
}

/**
 * Allocates each category's shipment expense across products with that
 * category's method, reconciling rounding so each category sums exactly
 * to its expense total. Categories whose basis is zero (e.g. no weights
 * entered) are reported in `issues` and not allocated.
 */
export function allocateShipment(products: ProductForAllocation[], categories: CategoryToAllocate[]): AllocationResult {
  const rows: AllocationRow[] = [];
  const issues: CategoryAllocationIssue[] = [];
  const perProduct = new Map<string, Record<string, number>>();
  products.forEach((p) => perProduct.set(p.id, {}));
  let allocatedCents = 0;
  let toAllocateCents = 0;

  for (const cat of categories) {
    const amountCents = toCents(cat.amount_sar);
    if (amountCents === 0) continue;
    toAllocateCents += amountCents;
    if (products.length === 0) {
      issues.push({ category_id: cat.category_id, category_name: cat.category_name, code: 'NO_PRODUCTS', message: 'Add products to the shipment first.' });
      continue;
    }
    let bases: number[];
    if (cat.method === 'manual') {
      const shares = products.map((p) => Number(cat.manualShares?.[p.id] ?? 0));
      const sum = roundTo(shares.reduce((a, b) => a + b, 0), 4);
      if (Math.abs(sum - 100) > 0.0001) {
        issues.push({
          category_id: cat.category_id,
          category_name: cat.category_name,
          code: 'MANUAL_NOT_100',
          message: `Manual shares total ${roundTo(sum, 2)}%; they must total 100%.`,
        });
        continue;
      }
      bases = shares;
    } else {
      bases = products.map((p) => basisFor(cat.method as Exclude<AllocationMethod, 'manual'>, p));
    }
    let parts: number[];
    try {
      parts = largestRemainder(amountCents, bases);
    } catch (e) {
      if (e instanceof AllocationError) {
        const what = cat.method === 'manual' ? 'manual shares' : ALLOCATION_METHOD_LABELS[cat.method].replace('By ', '');
        issues.push({
          category_id: cat.category_id,
          category_name: cat.category_name,
          code: e.code,
          message: `Cannot allocate ${cat.category_name}: ${what} is zero for every product.`,
        });
        continue;
      }
      throw e;
    }
    parts.forEach((cents, i) => {
      const p = products[i];
      allocatedCents += cents;
      const rec = perProduct.get(p.id)!;
      rec[cat.category_id] = fromCents((toCents(rec[cat.category_id] ?? 0)) + cents);
      rows.push({
        category_id: cat.category_id,
        shipment_product_id: p.id,
        method: cat.method,
        basis_value: bases[i],
        allocated_amount_sar: fromCents(cents),
      });
    });
  }

  const productTotals = products.map((p) => {
    const byCat = perProduct.get(p.id)!;
    const allocCents = Object.values(byCat).reduce((a, v) => a + toCents(v), 0);
    const landedCents = toCents(p.invoice_value_sar) + allocCents;
    return { p, byCat, allocCents, landedCents };
  });
  const grandLanded = productTotals.reduce((a, x) => a + x.landedCents, 0);

  return {
    rows,
    issues,
    totalAllocated: fromCents(allocatedCents),
    totalToAllocate: fromCents(toAllocateCents),
    reconciled: issues.length === 0 && allocatedCents === toAllocateCents,
    products: productTotals.map(({ p, byCat, allocCents, landedCents }) => ({
      id: p.id,
      label: p.label,
      quantity: Number(p.quantity),
      invoice_value_sar: round2(p.invoice_value_sar),
      allocated_by_category: byCat,
      allocated_total: fromCents(allocCents),
      landed_cost: fromCents(landedCents),
      landed_cost_per_unit: Number(p.quantity) > 0 ? roundTo(fromCents(landedCents) / Number(p.quantity), 4) : 0,
      share_pct: percentOf(landedCents, grandLanded),
      uplift_pct: percentOf(allocCents, toCents(p.invoice_value_sar)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid';

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
  totalLandedCost: number;
  /** Mean of per-shipment Additional Expense % (shipments with a product invoice only) */
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
  let totalCents = 0;
  let unpaidCount = 0;
  let unpaidCents = 0;
  const pcts: number[] = [];

  for (const s of list) {
    const a = analyzeShipmentCost(s.expenses, options);
    perShipment.set(s.id, a);
    for (const g of COST_GROUPS) byGroupCents[g] += toCents(a.byGroup[g]);
    additionalCents += toCents(a.additionalExpenseTotal);
    totalCents += toCents(a.totalLandedCost);
    if (a.additionalExpensePercentage !== null) pcts.push(a.additionalExpensePercentage);
    for (const e of s.expenses) {
      if (e.is_deleted) continue;
      if (e.payment_status && e.payment_status !== 'paid') {
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
    totalLandedCost: fromCents(totalCents),
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
