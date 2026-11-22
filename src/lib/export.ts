import { downloadBlob } from './utils';
import { fmtAmount, fmtDate, fmtNum, fmtPct } from './format';
import { APP_TITLE, COMPANY_NAME } from './constants';

export type ColumnFormat = 'text' | 'money' | 'pct' | 'int' | 'num' | 'date' | 'rate';

export interface ExportColumn<T = Record<string, unknown>> {
  header: string;
  key: keyof T & string;
  format?: ColumnFormat;
  width?: number;
}

export interface ExportTable<T = Record<string, unknown>> {
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
  totals?: Partial<Record<keyof T & string, string | number>>;
}

export interface ExportMeta {
  title: string;
  subtitle?: string;
  filters?: string[];
  companyName?: string;
  companyAddress?: string;
}

function formatCell(v: unknown, format: ColumnFormat = 'text'): string {
  if (v === null || v === undefined || v === '') return '';
  switch (format) {
    case 'money':
      return fmtAmount(Number(v));
    case 'pct':
      return fmtPct(Number(v));
    case 'int':
      return fmtNum(Number(v), 0);
    case 'num':
      return fmtNum(Number(v), 3);
    case 'rate':
      return Number(v).toFixed(6).replace(/0{1,2}$/, '');
    case 'date':
      return fmtDate(String(v));
    default:
      return String(v);
  }
}

function rawCell(v: unknown, format: ColumnFormat = 'text'): string | number {
  if (v === null || v === undefined) return '';
  if (format === 'money' || format === 'pct' || format === 'int' || format === 'num' || format === 'rate') {
    const n = Number(v);
    return Number.isFinite(n) ? n : '';
  }
  return String(v);
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------
export async function exportExcel(filename: string, tables: ExportTable[], meta?: ExportMeta): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const t of tables) {
    const header: (string | number)[][] = [];
    if (meta) {
      header.push([meta.companyName ?? COMPANY_NAME]);
      header.push([meta.title]);
      if (meta.subtitle) header.push([meta.subtitle]);
      (meta.filters ?? []).forEach((f) => header.push([f]));
      header.push([`Generated ${new Date().toLocaleString('en-GB')}`]);
      header.push([]);
    }
    const head = t.columns.map((c) => c.header);
    const body = t.rows.map((r) => t.columns.map((c) => rawCell((r as Record<string, unknown>)[c.key], c.format)));
    const aoa: (string | number)[][] = [...header, head, ...body];
    if (t.totals) aoa.push(t.columns.map((c) => rawCell(t.totals?.[c.key], c.format)));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = t.columns.map((c) => ({ wch: c.width ?? Math.max(12, c.header.length + 2) }));
    // number formats
    const firstDataRow = header.length + 1;
    t.columns.forEach((c, ci) => {
      const fmt = c.format === 'money' ? '#,##0.00' : c.format === 'pct' ? '0.00"%"' : c.format === 'rate' ? '0.000000' : c.format === 'int' ? '#,##0' : null;
      if (!fmt) return;
      for (let ri = firstDataRow; ri < aoa.length; ri++) {
        const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'number') cell.z = fmt;
      }
    });
    XLSX.utils.book_append_sheet(wb, ws, t.name.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
export function toCSV(table: ExportTable): string {
  const esc = (s: string | number) => {
    const str = String(s);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [table.columns.map((c) => esc(c.header)).join(',')];
  for (const r of table.rows) {
    lines.push(table.columns.map((c) => esc(rawCell((r as Record<string, unknown>)[c.key], c.format))).join(','));
  }
  if (table.totals) lines.push(table.columns.map((c) => esc(rawCell(table.totals?.[c.key], c.format))).join(','));
  return lines.join('\r\n');
}

export function exportCSV(filename: string, table: ExportTable): void {
  // BOM so Excel opens UTF-8 correctly
  downloadBlob(new Blob(['\ufeff' + toCSV(table)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
type JsPDF = import('jspdf').jsPDF;

export async function createPdf(orientation: 'portrait' | 'landscape' = 'landscape') {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const autoTable = autoTableMod.default;
  return { doc, autoTable };
}

export const PDF_NAVY: [number, number, number] = [11, 31, 58];
export const PDF_PRIMARY: [number, number, number] = [30, 58, 138];

/** Draws the company header band. Returns the y position below it. */
export function pdfHeader(doc: JsPDF, meta: ExportMeta): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_NAVY);
  doc.rect(0, 0, w, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(meta.companyName ?? COMPANY_NAME, 36, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(meta.companyAddress ? `${APP_TITLE} · ${meta.companyAddress}` : APP_TITLE, 36, 44);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, w - 36, 28, { align: 'right' });
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(meta.title, 36, 92);
  let y = 92;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  if (meta.subtitle) {
    y += 14;
    doc.text(meta.subtitle, 36, y);
  }
  for (const f of meta.filters ?? []) {
    y += 12;
    doc.text(f, 36, y);
  }
  doc.setTextColor(17, 24, 39);
  return y + 14;
}

export function pdfFooter(doc: JsPDF): void {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${COMPANY_NAME} — Confidential`, 36, h - 18);
    doc.text(`Page ${i} of ${pages}`, w - 36, h - 18, { align: 'right' });
  }
}

export async function exportPDF(filename: string, tables: ExportTable[], meta: ExportMeta, orientation: 'portrait' | 'landscape' = 'landscape'): Promise<void> {
  const { doc, autoTable } = await createPdf(orientation);
  let y = pdfHeader(doc, meta);
  for (const t of tables) {
    if (tables.length > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(t.name, 36, y + 4);
      y += 10;
    }
    const numeric = new Set(t.columns.map((c, i) => (c.format && c.format !== 'text' && c.format !== 'date' ? i : -1)).filter((i) => i >= 0));
    autoTable(doc, {
      startY: y + 4,
      head: [t.columns.map((c) => c.header)],
      body: t.rows.map((r) => t.columns.map((c) => formatCell((r as Record<string, unknown>)[c.key], c.format))),
      foot: t.totals ? [t.columns.map((c) => formatCell(t.totals?.[c.key], c.format))] : undefined,
      theme: 'grid',
      margin: { left: 36, right: 36 },
      styles: { fontSize: 7.5, cellPadding: 4, lineColor: [229, 233, 240], lineWidth: 0.5, textColor: [30, 41, 59] },
      headStyles: { fillColor: PDF_PRIMARY, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (numeric.has(data.column.index)) data.cell.styles.halign = 'right';
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }
  if (tables.every((t) => t.rows.length === 0)) {
    doc.setFontSize(10);
    doc.text('No records match the selected filters.', 36, y + 10);
  }
  pdfFooter(doc);
  doc.save(`${filename}.pdf`);
}
