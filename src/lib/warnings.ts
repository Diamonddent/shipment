import type { ExpenseWithRefs, Shipment } from '@/types/database';
import { todayISO } from './utils';

export interface ShipmentWarning {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

const AFTER_ARRIVAL = ['arrived', 'customs_clearance', 'delivered', 'completed'];
const AFTER_CLEARANCE = ['delivered', 'completed'];

/** Data-quality warnings shown on the dashboard, shipment page and notifications. */
export function shipmentWarnings(
  s: Pick<Shipment, 'status' | 'currency_code' | 'exchange_rate' | 'supplier_invoice_no' | 'supplier_invoice_date' | 'supplier_id' | 'expected_arrival_date' | 'actual_arrival_date'>,
  expenses: ExpenseWithRefs[],
  documentCount?: number | null,
): ShipmentWarning[] {
  if (s.status === 'cancelled') return [];
  const w: ShipmentWarning[] = [];
  const active = expenses.filter((e) => !e.is_deleted);
  const pi = active.filter((e) => e.category?.cost_group === 'product_invoice');

  if (!s.supplier_id) w.push({ level: 'warning', code: 'no_supplier', message: 'Supplier is not selected.' });
  if (!s.supplier_invoice_no || !s.supplier_invoice_date)
    w.push({ level: 'warning', code: 'no_supplier_invoice', message: 'Supplier invoice number or date is missing.' });
  if (pi.length === 0) w.push({ level: 'error', code: 'no_product_invoice', message: 'No Supplier Invoice expense entered — expense % cannot be calculated.' });
  if (s.currency_code !== 'SAR' && Number(s.exchange_rate) === 1)
    w.push({ level: 'error', code: 'shipment_rate', message: `Exchange rate for ${s.currency_code} looks missing (1.0).` });

  const badRate = active.filter((e) => e.currency_code !== 'SAR' && Number(e.exchange_rate) === 1);
  if (badRate.length) w.push({ level: 'error', code: 'expense_rate', message: `${badRate.length} expense(s) in foreign currency have exchange rate 1.0.` });
  const noInvoice = active.filter((e) => !e.invoice_no?.trim());
  if (noInvoice.length) w.push({ level: 'warning', code: 'expense_invoice', message: `${noInvoice.length} expense(s) have no invoice number.` });
  const zero = active.filter((e) => Number(e.original_amount) === 0);
  if (zero.length) w.push({ level: 'warning', code: 'expense_zero', message: `${zero.length} expense(s) have a zero amount.` });

  if (AFTER_ARRIVAL.includes(s.status) && !active.some((e) => e.category?.cost_group === 'freight'))
    w.push({ level: 'warning', code: 'no_freight', message: 'No freight expense entered.' });
  if (AFTER_CLEARANCE.includes(s.status) && !active.some((e) => e.category?.cost_group === 'customs_duty'))
    w.push({ level: 'warning', code: 'no_duty', message: 'No customs duty entered.' });
  if (AFTER_CLEARANCE.includes(s.status) && !active.some((e) => e.category?.cost_group === 'import_vat'))
    w.push({ level: 'warning', code: 'no_vat', message: 'No import VAT entered.' });
  if (s.status === 'completed') {
    const unpaid = active.filter((e) => (e.payment_status === 'unpaid' || e.payment_status === 'partially_paid'));
    if (unpaid.length) w.push({ level: 'warning', code: 'completed_unpaid', message: `Completed shipment still has ${unpaid.length} unpaid expense(s).` });
  }
  const pending = active.filter((e) => e.review_status === 'rejected');
  if (pending.length) w.push({ level: 'warning', code: 'rejected', message: `${pending.length} expense(s) were rejected in review.` });
  if (s.expected_arrival_date && !s.actual_arrival_date && s.expected_arrival_date < todayISO() && !AFTER_ARRIVAL.includes(s.status))
    w.push({ level: 'info', code: 'overdue', message: 'Expected arrival date has passed.' });
  if (documentCount === 0 && s.status !== 'draft') w.push({ level: 'info', code: 'no_docs', message: 'No supporting documents uploaded.' });
  return w;
}
