import { describe, expect, it } from 'vitest';
import {
  allocateAmount,
  allocateShipment,
  analyzeShipmentCost,
  derivePaymentStatus,
  expensePayable,
  largestRemainder,
  outstandingSar,
  percentOf,
  productInvoiceValueSar,
  reconciledPercentages,
  round2,
  sumMoney,
  summarizePortfolio,
  toSar,
  AllocationError,
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
  it('Product Invoice Value = Qty × Unit Price × Rate', () => {
    expect(productInvoiceValueSar(200, 85, 4.05)).toBe(68850);
    expect(productInvoiceValueSar(3, 9.99, 3.75)).toBe(112.39);
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

  it('computes total landed cost', () => {
    expect(a.totalLandedCost).toBe(120000);
    expect(a.productInvoiceValue).toBe(90000);
  });
  it('computes expense percentage of total landed cost', () => {
    const pct = Object.fromEntries(a.groupRows.map((r) => [r.key, r.percentage]));
    expect(pct.product_invoice).toBe(75);
    expect(pct.freight).toBe(6.67);
    expect(pct.customs_duty).toBe(4.17);
    expect(pct.import_vat).toBe(10);
    expect(pct.clearance).toBe(1.67);
    expect(pct.other).toBe(2.5);
  });
  it('computes additional expense total, additional % and cost increase % separately', () => {
    expect(a.additionalExpenseTotal).toBe(30000);
    // 30,000 / 90,000 = 33.33 % over invoice — NOT the 25 % share of landed cost
    expect(a.additionalExpensePercentage).toBe(33.33);
    expect(a.costIncreasePercentage).toBe(33.33);
    expect(100 - (a.groupRows.find((r) => r.key === 'product_invoice')?.percentage ?? 0)).toBe(25);
  });
  it('exposes landed cost excluding recoverable import VAT', () => {
    expect(a.recoverableVat).toBe(12000);
    expect(a.landedCostExclRecoverableVat).toBe(108000);
  });
  it('reconciled display percentages add to exactly 100', () => {
    const p = reconciledPercentages(a.groupRows.map((r) => r.amount));
    expect(round2(p.reduce((x, y) => x + y, 0))).toBe(100);
  });
  it('returns null percentages when there is no product invoice', () => {
    const b = analyzeShipmentCost([exp('Freight', 'freight', 500)]);
    expect(b.additionalExpensePercentage).toBeNull();
    expect(b.totalLandedCost).toBe(500);
  });
  it('ignores soft-deleted expenses', () => {
    const b = analyzeShipmentCost([...specExample, exp('Other', 'other', 9999, { is_deleted: true })]);
    expect(b.totalLandedCost).toBe(120000);
  });
});

describe('VAT is never double counted', () => {
  const withLineVat = [
    ...specExample,
    exp('Clearance', 'clearance', 0, { vat_amount_sar: 300 }), // VAT on the clearance agent invoice
  ];
  it('line VAT is reported separately by default', () => {
    const a = analyzeShipmentCost(withLineVat);
    expect(a.totalLandedCost).toBe(120000);
    expect(a.lineVat).toBe(300);
    expect(a.byGroup.import_vat).toBe(12000);
  });
  it('line VAT is added once when the setting says so, and excluded from the ex-VAT figure', () => {
    const a = analyzeShipmentCost(withLineVat, { includeLineVat: true });
    expect(a.totalLandedCost).toBe(120300);
    expect(a.byGroup.import_vat).toBe(12300);
    expect(a.landedCostExclRecoverableVat).toBe(108000);
  });
});

describe('allocation', () => {
  it('spec example: 15,000 by value 10k/20k/30k => 2,500 / 5,000 / 7,500', () => {
    expect(allocateAmount(15000, [10000, 20000, 30000])).toEqual([2500, 5000, 7500]);
  });

  it('largest-remainder reconciles awkward splits to the halala', () => {
    const parts = allocateAmount(100, [1, 1, 1]);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
    expect(sumMoney(parts)).toBe(100);

    const odd = allocateAmount(1234.57, [3, 7, 11, 13, 17]);
    expect(sumMoney(odd)).toBe(1234.57);
    odd.forEach((v) => expect(round2(v)).toBe(v));

    const tiny = allocateAmount(0.05, [1, 1, 1, 1, 1, 1, 1]);
    expect(sumMoney(tiny)).toBe(0.05);
    expect(tiny.filter((x) => x === 0.01)).toHaveLength(5);
  });

  it('random awkward splits always sum exactly', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let t = 0; t < 200; t++) {
      const amount = round2(rnd() * 100000);
      const weights = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => round2(rnd() * 5000));
      if (weights.every((w) => w === 0)) continue;
      expect(sumMoney(allocateAmount(amount, weights))).toBe(amount);
    }
  });

  it('zero weights receive nothing; all-zero basis raises ZERO_BASIS', () => {
    expect(allocateAmount(90, [0, 1, 2])).toEqual([0, 30, 60]);
    expect(() => largestRemainder(100, [0, 0])).toThrow(AllocationError);
    try {
      allocateAmount(10, [0, 0, 0]);
    } catch (e) {
      expect((e as AllocationError).code).toBe('ZERO_BASIS');
    }
  });

  const products = [
    { id: 'A', quantity: 100, invoice_value_sar: 10000, net_weight: 50, gross_weight: 60 },
    { id: 'B', quantity: 50, invoice_value_sar: 20000, net_weight: 0, gross_weight: 0 },
    { id: 'C', quantity: 25, invoice_value_sar: 30000, net_weight: 150, gross_weight: 180 },
  ];

  it('allocates different methods per category and computes landed cost per product and per unit', () => {
    const r = allocateShipment(products, [
      { category_id: 'freight', category_name: 'Freight', amount_sar: 2400, method: 'gross_weight' },
      { category_id: 'duty', category_name: 'Customs Duty', amount_sar: 15000, method: 'value' },
      { category_id: 'handling', category_name: 'Handling', amount_sar: 350, method: 'quantity' },
    ]);
    expect(r.issues).toEqual([]);
    expect(r.reconciled).toBe(true);
    expect(r.totalAllocated).toBe(17750);
    const A = r.products.find((p) => p.id === 'A')!;
    const B = r.products.find((p) => p.id === 'B')!;
    const C = r.products.find((p) => p.id === 'C')!;
    // freight by gross weight 60/0/180 => 600 / 0 / 1800
    expect(A.allocated_by_category.freight).toBe(600);
    expect(B.allocated_by_category.freight).toBe(0);
    expect(C.allocated_by_category.freight).toBe(1800);
    // duty by value => 2500 / 5000 / 7500
    expect(A.allocated_by_category.duty).toBe(2500);
    expect(C.allocated_by_category.duty).toBe(7500);
    // handling by quantity 100/50/25 of 350 => 200 / 100 / 50
    expect(B.allocated_by_category.handling).toBe(100);
    expect(A.landed_cost).toBe(10000 + 600 + 2500 + 200);
    expect(A.landed_cost_per_unit).toBe(133);
    expect(C.landed_cost_per_unit).toBe(round2((30000 + 1800 + 7500 + 50) / 25));
    expect(sumMoney(r.products.map((p) => p.landed_cost))).toBe(60000 + 17750);
  });

  it('reports zero net-weight basis as an issue instead of silently mis-allocating', () => {
    const r = allocateShipment(
      products.map((p) => ({ ...p, net_weight: 0 })),
      [
        { category_id: 'freight', category_name: 'Freight', amount_sar: 1000, method: 'net_weight' },
        { category_id: 'duty', category_name: 'Customs Duty', amount_sar: 600, method: 'value' },
      ],
    );
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].code).toBe('ZERO_BASIS');
    expect(r.reconciled).toBe(false);
    expect(r.totalAllocated).toBe(600);
    expect(r.totalToAllocate).toBe(1600);
  });

  it('manual allocation requires shares totalling 100% and reconciles rounding', () => {
    const bad = allocateShipment(products, [
      { category_id: 'x', category_name: 'Other', amount_sar: 100, method: 'manual', manualShares: { A: 50, B: 30 } },
    ]);
    expect(bad.issues[0].code).toBe('MANUAL_NOT_100');
    const ok = allocateShipment(products, [
      { category_id: 'x', category_name: 'Other', amount_sar: 100, method: 'manual', manualShares: { A: 33.33, B: 33.33, C: 33.34 } },
    ]);
    expect(ok.reconciled).toBe(true);
    expect(sumMoney(ok.rows.map((r) => r.allocated_amount_sar))).toBe(100);
  });

  it('awkward category totals across awkward bases still reconcile per category', () => {
    const r = allocateShipment(
      [
        { id: 'p1', quantity: 7, invoice_value_sar: 333.33 },
        { id: 'p2', quantity: 11, invoice_value_sar: 666.67 },
        { id: 'p3', quantity: 13, invoice_value_sar: 1000.01 },
      ],
      [
        { category_id: 'a', category_name: 'A', amount_sar: 101.01, method: 'quantity' },
        { category_id: 'b', category_name: 'B', amount_sar: 0.02, method: 'value' },
        { category_id: 'c', category_name: 'C', amount_sar: 9999.99, method: 'value' },
      ],
    );
    for (const cat of ['a', 'b', 'c']) {
      const s = sumMoney(r.rows.filter((x) => x.category_id === cat).map((x) => x.allocated_amount_sar));
      expect(s).toBe({ a: 101.01, b: 0.02, c: 9999.99 }[cat]);
    }
    expect(r.reconciled).toBe(true);
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
    expect(s.totalLandedCost).toBe(131000);
    expect(s.additionalExpenses).toBe(31000);
    expect(s.freight).toBe(9000);
    expect(s.vat).toBe(12000);
    expect(s.customsDuty).toBe(5000);
    expect(s.pendingShipments).toBe(1);
    expect(s.completedShipments).toBe(1);
    expect(s.unpaidExpenseCount).toBe(2);
    expect(s.unpaidExpenseAmount).toBe(5000);
    expect(s.averageAdditionalPct).toBe(round2((33.33 + 10) / 2));
    expect(s.weightedAdditionalPct).toBe(31);
  });

  it('includes cancelled shipments only when explicitly requested', () => {
    const s = summarizePortfolio(shipments, { includeCancelled: true });
    expect(s.totalShipments).toBe(3);
    expect(s.productInvoiceValue).toBe(150000);
  });
});
