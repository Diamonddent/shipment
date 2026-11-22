import { createPdf, pdfFooter, pdfHeader, PDF_PRIMARY } from '@/lib/export';
import { analyzeShipmentCost, allocateShipment, outstandingSar, sumMoney, toCents, type CategoryToAllocate } from '@/lib/calculations';
import { fmtAmount, fmtDate, fmtNum, fmtPct, fmtRate } from '@/lib/format';
import { PAYMENT_STATUS_LABEL, SHIPMENT_STATUS_LABEL, SHIPPING_METHOD_LABEL } from '@/lib/constants';
import { toCalcExpense } from '@/hooks/queries';
import type { ExpenseAllocation, ExpenseCategory, ExpenseWithRefs, ShipmentProduct, ShipmentWithRefs } from '@/types/database';

const right = (cols: number[]) => (d: { column: { index: number }; cell: { styles: { halign: string } } }) => {
  if (cols.includes(d.column.index)) d.cell.styles.halign = 'right';
};
const unit = (v: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);

export interface StatementInput {
  shipment: ShipmentWithRefs;
  expenses: ExpenseWithRefs[];
  products: ShipmentProduct[];
  categories: ExpenseCategory[];
  allocations: ExpenseAllocation[];
  includeLineVat: boolean;
  companyName: string;
  companyAddress?: string;
  preparedBy?: string;
}

/** Detailed shipment cost statement for management review (PDF). */
export async function generateCostStatement(input: StatementInput): Promise<void> {
  const { shipment: s, expenses, products, categories, allocations } = input;
  const analysis = analyzeShipmentCost(expenses.map(toCalcExpense), { includeLineVat: input.includeLineVat });
  const { doc, autoTable } = await createPdf('portrait');
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const pageW = doc.internal.pageSize.getWidth();

  let y = pdfHeader(doc, {
    title: `Shipment Cost Statement — ${s.shipment_code}`,
    subtitle: `PO ${s.po_number ?? '—'} · ${s.supplier?.name ?? 'No supplier'} · Status: ${SHIPMENT_STATUS_LABEL[s.status]}`,
    companyName: input.companyName,
    companyAddress: input.companyAddress,
  });

  const info: [string, string][] = [
    ['Shipment ID', s.shipment_code],
    ['Reference', s.reference_no ?? '—'],
    ['PO number', s.po_number ?? '—'],
    ['Supplier', s.supplier?.name ?? '—'],
    ['Supplier invoice', `${s.supplier_invoice_no ?? '—'} (${fmtDate(s.supplier_invoice_date)})`],
    ['Country of origin', s.country_of_origin ?? '—'],
    ['Shipping method', s.shipping_method ? SHIPPING_METHOD_LABEL[s.shipping_method] : '—'],
    ['Freight forwarder', s.forwarder?.name ?? '—'],
    ['AWB / BL', s.awb_bl_no ?? '—'],
    ['Invoice currency / rate', `${s.currency_code} @ ${fmtRate(s.exchange_rate)}`],
    ['Departure / arrival', `${fmtDate(s.departure_date)} to ${fmtDate(s.actual_arrival_date ?? s.expected_arrival_date)}`],
    ['Clearance / warehouse', `${fmtDate(s.customs_clearance_date)} / ${fmtDate(s.warehouse_receiving_date)}`],
  ];
  const half = Math.ceil(info.length / 2);
  autoTable(doc, {
    startY: y,
    body: info.slice(0, half).map((r, i) => [r[0], r[1], info[half + i]?.[0] ?? '', info[half + i]?.[1] ?? '']),
    theme: 'plain',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: { 0: { textColor: [100, 116, 139], cellWidth: 95 }, 2: { textColor: [100, 116, 139], cellWidth: 95 } },
  });
  y = lastY() + 14;

  // Cost analysis
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Expense analysis (SAR)', 36, y);
  autoTable(doc, {
    startY: y + 6,
    head: [['Expense category', 'Amount SAR', '% of landed cost']],
    body: analysis.byCategory.map((r) => [r.label, fmtAmount(r.amount), fmtPct(r.percentage)]),
    foot: [['Total landed cost', fmtAmount(analysis.totalLandedCost), '100.00%']],
    theme: 'grid',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: [229, 233, 240], lineWidth: 0.5 },
    headStyles: { fillColor: PDF_PRIMARY, textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    didParseCell: right([1, 2]),
  });
  y = lastY() + 12;

  const summary: [string, string][] = [
    ['Product invoice value', `SAR ${fmtAmount(analysis.productInvoiceValue)}`],
    ['Additional expense total', `SAR ${fmtAmount(analysis.additionalExpenseTotal)}`],
    ['Additional expense % (over invoice)', fmtPct(analysis.additionalExpensePercentage)],
    ['Cost increase %', fmtPct(analysis.costIncreasePercentage)],
    ['Total landed cost', `SAR ${fmtAmount(analysis.totalLandedCost)}`],
    ['Landed cost excl. recoverable VAT', `SAR ${fmtAmount(analysis.landedCostExclRecoverableVat)}`],
    [analysis.lineVatIncluded ? 'Service-invoice VAT (included above)' : 'Service-invoice VAT (reported separately)', `SAR ${fmtAmount(analysis.lineVat)}`],
  ];
  autoTable(doc, {
    startY: y,
    body: summary,
    theme: 'plain',
    margin: { left: pageW / 2, right: 36 },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.row.index === 4) {
        d.cell.styles.fillColor = [238, 242, 255];
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = lastY() + 16;

  // Expense lines
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Expense details', 36, y);
  const active = expenses.filter((e) => !e.is_deleted);
  autoTable(doc, {
    startY: y + 6,
    head: [['Expense', 'Category', 'Provider / invoice', 'Original', 'Rate', 'SAR', 'VAT SAR', 'Payment']],
    body: active.map((e) => [
      e.expense_no,
      e.category?.name ?? '',
      `${e.service_provider ?? ''}\n${e.invoice_no ?? ''} ${e.invoice_date ? `(${fmtDate(e.invoice_date)})` : ''}`,
      `${e.currency_code} ${fmtAmount(e.original_amount)}`,
      fmtRate(e.exchange_rate),
      fmtAmount(e.amount_sar),
      Number(e.vat_amount_sar) ? fmtAmount(e.vat_amount_sar) : '—',
      PAYMENT_STATUS_LABEL[e.payment_status],
    ]),
    foot: [['Total', '', '', '', '', fmtAmount(sumMoney(active.map((e) => Number(e.amount_sar)))), fmtAmount(analysis.lineVat), '']],
    theme: 'grid',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 7, cellPadding: 3, lineColor: [229, 233, 240], lineWidth: 0.5 },
    headStyles: { fillColor: PDF_PRIMARY, textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    didParseCell: right([3, 4, 5, 6]),
  });
  y = lastY() + 8;
  const outstanding = sumMoney(active.map((e) => outstandingSar(Number(e.original_amount), Number(e.vat_amount), Number(e.paid_amount), Number(e.exchange_rate))));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Outstanding payments: SAR ${fmtAmount(outstanding)}  ·  Expenses: ${active.length}  ·  Unpaid/partial: ${active.filter((e) => e.payment_status !== 'paid').length}`, 36, y + 6);
  y += 20;

  // Product landed cost
  if (products.length) {
    const byCat = new Map<string, number>();
    for (const e of active) {
      const c = categories.find((x) => x.id === e.category_id);
      if (c?.is_allocatable) byCat.set(c.id, (byCat.get(c.id) ?? 0) + toCents(Number(e.amount_sar)));
    }
    const cats: CategoryToAllocate[] = [...byCat.entries()].map(([id, cents]) => {
      const c = categories.find((x) => x.id === id)!;
      return { category_id: id, category_name: c.name, amount_sar: cents / 100, method: allocations.find((a) => a.category_id === id)?.method ?? c.default_allocation_method, manualShares: Object.fromEntries(allocations.filter((a) => a.category_id === id && a.method === 'manual').map((a) => [a.shipment_product_id, Number(a.basis_value)])) };
    });
    const res = allocateShipment(products.map((p) => ({ id: p.id, quantity: Number(p.quantity), invoice_value_sar: Number(p.invoice_value_sar), net_weight: p.net_weight, gross_weight: p.gross_weight })), cats);
    if (y > doc.internal.pageSize.getHeight() - 160) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Product landed cost', 36, y);
    autoTable(doc, {
      startY: y + 6,
      head: [['Item', 'Description', 'Qty', 'Invoice SAR', 'Allocated SAR', 'Landed SAR', 'Per unit SAR']],
      body: res.products.map((p) => {
        const src = products.find((x) => x.id === p.id)!;
        return [src.item_code, src.description, `${fmtNum(p.quantity)} ${src.unit_of_measure}`, fmtAmount(p.invoice_value_sar), fmtAmount(p.allocated_total), fmtAmount(p.landed_cost), unit(p.landed_cost_per_unit)];
      }),
      foot: [['Total', '', '', fmtAmount(sumMoney(res.products.map((p) => p.invoice_value_sar))), fmtAmount(res.totalAllocated), fmtAmount(sumMoney(res.products.map((p) => p.landed_cost))), '']],
      theme: 'grid',
      margin: { left: 36, right: 36 },
      styles: { fontSize: 7, cellPadding: 3, lineColor: [229, 233, 240], lineWidth: 0.5 },
      headStyles: { fillColor: PDF_PRIMARY, textColor: 255 },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      didParseCell: right([2, 3, 4, 5, 6]),
    });
    y = lastY() + 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `Allocation: ${cats.map((c) => `${c.category_name} by ${c.method.replace('_', ' ')}`).join('; ') || 'none'}.${res.issues.length ? ` Not allocated: ${res.issues.map((i) => i.category_name).join(', ')}.` : ''}`,
      36,
      y + 6,
      { maxWidth: pageW - 72 },
    );
    y += 24;
  }

  // Sign-off
  if (y > doc.internal.pageSize.getHeight() - 90) {
    doc.addPage();
    y = 60;
  }
  y += 24;
  const colW = (pageW - 72) / 3;
  ['Prepared by', 'Reviewed by', 'Approved by'].forEach((l, i) => {
    const x = 36 + i * colW;
    doc.setDrawColor(203, 213, 225);
    doc.line(x, y, x + colW - 24, y);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(i === 0 && input.preparedBy ? `${l}: ${input.preparedBy}` : l, x, y + 12);
  });
  pdfFooter(doc);
  doc.save(`Cost-Statement_${s.po_number ?? 'NO-PO'}_${s.shipment_code}.pdf`.replace(/\s+/g, '-'));
}
