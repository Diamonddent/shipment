import { createPdf, pdfFooter, pdfHeader, PDF_PRIMARY } from '@/lib/export';
import { analyzeShipmentCost, outstandingSar, sumMoney } from '@/lib/calculations';
import { fmtAmount, fmtDate, fmtPct, fmtRate } from '@/lib/format';
import { PAYMENT_STATUS_LABEL, SHIPMENT_STATUS_LABEL, SHIPPING_METHOD_LABEL } from '@/lib/constants';
import { toCalcExpense } from '@/hooks/queries';
import type { DocumentWithRefs, ExpenseCategory, ExpenseWithRefs, ShipmentWithRefs } from '@/types/database';
import { shipmentFolderName } from '@/services/googleDrive';

const right = (cols: number[]) => (d: { column: { index: number }; cell: { styles: { halign: string } } }) => {
  if (cols.includes(d.column.index)) d.cell.styles.halign = 'right';
};

export interface StatementInput {
  shipment: ShipmentWithRefs;
  expenses: ExpenseWithRefs[];
  /** Drive documents of the shipment; each expense line lists its attachment numbers */
  documents?: DocumentWithRefs[];
  categories?: ExpenseCategory[];
  includeLineVat: boolean;
  companyName: string;
  companyAddress?: string;
  preparedBy?: string;
}

/** Detailed shipment cost statement for management review (PDF). */
export async function generateCostStatement(input: StatementInput): Promise<void> {
  const { shipment: s, expenses } = input;
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
  doc.text('Expenses as % of supplier invoice (SAR)', 36, y);
  const inv = analysis.productInvoiceValue;
  const expRows = analysis.byCategory.filter((r) => r.group !== 'product_invoice');
  autoTable(doc, {
    startY: y + 6,
    head: [['Expense', 'Amount SAR', '% of supplier invoice']],
    body: [
      ['Supplier invoice value (base)', fmtAmount(inv), inv > 0 ? 'base' : '—'],
      ...expRows.map((r) => [r.label, fmtAmount(r.amount), fmtPct(r.pctOfInvoice)]),
    ],
    foot: [['Total expenses', fmtAmount(analysis.additionalExpenseTotal), fmtPct(analysis.additionalExpensePercentage)]],
    theme: 'grid',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: [229, 233, 240], lineWidth: 0.5 },
    headStyles: { fillColor: PDF_PRIMARY, textColor: 255 },
    footStyles: { fillColor: [238, 242, 255], textColor: [15, 23, 42], fontStyle: 'bold' },
    didParseCell: (d) => {
      if (d.column.index > 0) d.cell.styles.halign = 'right';
      if (d.section === 'body' && d.row.index === 0) {
        d.cell.styles.fillColor = [248, 250, 252];
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = lastY() + 12;

  const summary: [string, string][] = [
    ['Supplier invoice value', `SAR ${fmtAmount(analysis.productInvoiceValue)}`],
    ['Total expenses', `SAR ${fmtAmount(analysis.additionalExpenseTotal)}`],
    ['Expenses % of supplier invoice', fmtPct(analysis.additionalExpensePercentage)],
  ];
  if (analysis.lineVat > 0)
    summary.push([analysis.lineVatIncluded ? 'Service-invoice VAT (included above)' : 'Service-invoice VAT (not included)', `SAR ${fmtAmount(analysis.lineVat)}`]);
  autoTable(doc, {
    startY: y,
    body: summary,
    theme: 'plain',
    margin: { left: pageW / 2, right: 36 },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.row.index === 2) {
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
  const isInv = (e: ExpenseWithRefs) => e.category?.cost_group === 'product_invoice';
  const ordered = [...active.filter(isInv), ...active.filter((e) => !isInv(e))];
  const docsOf = (e: ExpenseWithRefs) => (input.documents ?? []).filter((d) => d.expense_id === e.id && !d.is_deleted).map((d) => d.doc_no);
  const payable = active.filter((e) => !isInv(e));
  autoTable(doc, {
    startY: y + 6,
    head: [['Expense', 'Category', 'Provider / invoice', 'Original', 'Rate', 'SAR', 'Payment', 'Attachment']],
    body: ordered.map((e) => [
      e.expense_no,
      e.category?.name ?? '',
      `${e.service_provider ?? ''}\n${e.invoice_no ?? ''} ${e.invoice_date ? `(${fmtDate(e.invoice_date)})` : ''}`,
      `${e.currency_code} ${fmtAmount(e.original_amount)}`,
      fmtRate(e.exchange_rate),
      fmtAmount(e.amount_sar),
      isInv(e) ? '—' : PAYMENT_STATUS_LABEL[e.payment_status],
      docsOf(e).join('\n') || '—',
    ]),
    foot: [['Total expenses (excl. supplier invoice)', '', '', '', '', fmtAmount(analysis.additionalExpenseTotal), '', '']],
    theme: 'grid',
    margin: { left: 36, right: 36 },
    styles: { fontSize: 7, cellPadding: 3, lineColor: [229, 233, 240], lineWidth: 0.5 },
    headStyles: { fillColor: PDF_PRIMARY, textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    didParseCell: (d) => {
      right([3, 4, 5])(d);
      if (d.section === 'foot' && d.column.index === 0) d.cell.colSpan = 5;
    },
  });
  y = lastY() + 8;
  const outstanding = sumMoney(payable.map((e) => outstandingSar(Number(e.original_amount), Number(e.vat_amount), Number(e.paid_amount), Number(e.exchange_rate))));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Outstanding payments: SAR ${fmtAmount(outstanding)}  ·  Unpaid/partial: ${payable.filter((e) => e.payment_status === 'unpaid' || e.payment_status === 'partially_paid').length}  ·  Supplier invoice has no payment status.`,
    36,
    y + 6,
  );
  doc.text(`Attachments are stored in Google Drive (folder "${shipmentFolderName(s.po_number, s.shipment_code)}").`, 36, y + 17);
  doc.setTextColor(17, 24, 39);
  y += 28;

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
