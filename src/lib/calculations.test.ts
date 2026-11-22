import { describe, expect, it } from 'vitest';
import {
  analyzeShipmentCost,
  derivePaymentStatus,
  expensePayable,
  largestRemainder,
  outstandingSar,
  percentOf,
  reconciledPercentages,
  round2,
  sumMoney,
  summarizePortfolio,
  toSar,
  type ExpenseForCalc,
  type ShipmentForSummary,
} from './calculations';

const exp = (
  category_id: string,
  cost_group: ExpenseForCalc['cost_group'],
  amount_sar: number,
  extra: Partial<ExpenseForCalc> = {},
): ExpenseForCalc => ({ category_id, category_name: category_id, cost_group, amount_sar, ...extra });

/** The spec's worked example: 90,000 invoice, 120,000 total landed cost. */
const specExample: ExpenseForCalc[] = [
  exp('Product Invoice', 'product_invoice', 90000),
  exp('Freight', 'freight', 8000),
  exp('Customs Duty', 'customs_duty', 5000),
  exp('VAT', 'import_vat', 12000, { is_recoverable_vat: true }),
  exp('Clearance', 'clearance', 2000),
  exp('Other', 'other', 3000),
];

describe('rounding & conversion', () => {
  it('rounds half away from zero like PostgreSQL', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it('Amount in SAR = Original × Exchange Rate', () => {
    expect(toSar(1000, 3.75)).toBe(3750);
    expect(toSar(100.01, 3.75)).toBe(375.04);
    expect(toSar(32000, 4.05)).toBe(129600);
    expect(toSar(123.45, 0.52)).toBe(64.19);
  });
  it('sums money without float drift', () => {
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sumMoney([1e6 + 0.01, 0.02, null, undefined])).toBe(1000000.03);
  });
  it('percentOf handles zero totals', () => {
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(1, 3)).toBe(33.33);
  });
});

describe('shipment cost analysis (spec example)', () => {
  const a = analyzeShipmentCost(specExample);

  it('computes supplier invoice and total expenses (invoice excluded)', () => {
    expect(a.productInvoiceValue).toBe(90000);
    expect(a.additionalExpenseTotal).toBe(30000);
  });
  it('computes each expense share of total expenses (supplier invoice = 0)', () => {
    const pct = Object.fromEntries(a.groupRows.map((r) => [r.key, r.percentage]));
    expect(pct.product_invoice).toBe(0);
    expect(pct.freight).toBe(26.67);
    expect(pct.import_vat).toBe(40);
  });
  it('total expenses % of supplier invoice', () => {
    // 30,000 / 90,000 = 33.33 %
    expect(a.additionalExpensePercentage).toBe(33.33);
  });
  it('tracks recoverable import VAT', () => {
    expect(a.recoverableVat).toBe(12000);
  });
  it('reconciled display percentages add to exactly 100', () => {
    const p = reconciledPercentages(a.groupRows.map((r) => r.amount));
    expect(round2(p.reduce((x, y) => x + y, 0))).toBe(100);
  });
  it('returns null percentages when there is no product invoice', () => {
    const b = analyzeShipmentCost([exp('Freight', 'freight', 500)]);
    expect(b.additionalExpensePercentage).toBeNull();
    expect(b.additionalExpenseTotal).toBe(500);
  });
  it('ignores soft-deleted expenses', () => {
    const b = analyzeShipmentCost([...specExample, exp('Other', 'other', 9999, { is_deleted: true })]);
    expect(b.additionalExpenseTotal).toBe(30000);
  });
});

describe('VAT is never double counted', () => {
  const withLineVat = [
    ...specExample,
    exp('Clearance', 'clearance', 0, { vat_amount_sar: 300 }), // VAT on the clearance agent invoice
  ];
  it('line VAT is reported separately by default', () => {
    const a = analyzeShipmentCost(withLineVat);
    expect(a.additionalExpenseTotal).toBe(30000);
    expect(a.lineVat).toBe(300);
    expect(a.byGroup.import_vat).toBe(12000);
  });
  it('line VAT is added once to total expenses when the setting says so', () => {
    const a = analyzeShipmentCost(withLineVat, { includeLineVat: true });
    expect(a.additionalExpenseTotal).toBe(30300);
    expect(a.byGroup.import_vat).toBe(12300);
  });
});

describe('expenses as % of supplier invoice', () => {
  it('each cost line and the total are expressed against the supplier invoice', () => {
    const a = analyzeShipmentCost(specExample);
    const row = (k: string) => a.groupRows.find((r) => r.key === k)!;
    expect(row('freight').pctOfInvoice).toBe(8.89);
    expect(row('customs_duty').pctOfInvoice).toBe(5.56);
    expect(row('product_invoice').pctOfInvoice).toBe(100);
    expect(a.additionalExpenseTotal).toBe(30000);
    expect(a.additionalExpensePercentage).toBe(33.33);
  });
  it('largestRemainder reconciles to the exact total', () => {
    expect(largestRemainder(10000, [1, 1, 1]).reduce((x, y) => x + y, 0)).toBe(10000);
    expect(largestRemainder(100, [0, 0])).toEqual([0, 0]);
  });
});

describe('payments', () => {
  it('derives status incl. partial payments', () => {
    expect(derivePaymentStatus(0, 100)).toBe('unpaid');
    expect(derivePaymentStatus(40, 100)).toBe('partially_paid');
    expect(derivePaymentStatus(100, 100)).toBe('paid');
    expect(derivePaymentStatus(115, expensePayable(100, 15))).toBe('paid');
    expect(derivePaymentStatus(100, expensePayable(100, 15))).toBe('partially_paid');
  });
  it('outstanding SAR uses the stored historical rate', () => {
    expect(outstandingSar(1000, 0, 400, 3.75)).toBe(2250);
    expect(outstandingSar(1000, 150, 1150, 3.75)).toBe(0);
  });
});

describe('portfolio summary', () => {
  const shipments: ShipmentForSummary[] = [
    { id: 's1', status: 'completed', expenses: specExample.map((e) => ({ ...e, payment_status: 'paid' as const })) },
    {
      id: 's2',
      status: 'in_transit',
      expenses: [
        { ...exp('PI', 'product_invoice', 10000), payment_status: 'partially_paid', outstanding_sar: 4000 },
        { ...exp('Freight', 'freight', 1000), payment_status: 'unpaid', outstanding_sar: 1000 },
      ],
    },
    {
      id: 's3',
      status: 'cancelled',
      expenses: [{ ...exp('PI', 'product_invoice', 50000), payment_status: 'unpaid' }],
    },
  ];

  it('excludes cancelled shipments from normal financial summaries', () => {
    const s = summarizePortfolio(shipments);
    expect(s.totalShipments).toBe(2);
    expect(s.productInvoiceValue).toBe(100000);
    expect(s.additionalExpenses).toBe(31000);
    expect(s.freight).toBe(9000);
    expect(s.vat).toBe(12000);
    expect(s.customsDuty).toBe(5000);
    expect(s.pendingShipments).toBe(1);
    expect(s.completedShipments).toBe(1);
    // supplier invoice has no payment status, so only the unpaid freight counts
    expect(s.unpaidExpenseCount).toBe(1);
    expect(s.unpaidExpenseAmount).toBe(1000);
    expect(s.averageAdditionalPct).toBe(round2((33.33 + 10) / 2));
    expect(s.weightedAdditionalPct).toBe(31);
  });

  it('includes cancelled shipments only when explicitly requested', () => {
    const s = summarizePortfolio(shipments, { includeCancelled: true });
    expect(s.totalShipments).toBe(3);
    expect(s.productInvoiceValue).toBe(150000);
  });
});
