import { supabase } from '@/lib/supabase';
import type { ExpensePayment, ExpenseWithRefs, ShipmentExpense } from '@/types/database';
import { fetchAll, unwrap } from './base';

export const EXPENSE_SELECT =
  '*, category:expense_categories(id,name,code,cost_group,is_recoverable_vat,is_allocatable,default_allocation_method), shipment:shipments(id,shipment_code,po_number,status,is_archived,supplier_id)';

export type ExpenseInput = Partial<
  Omit<
    ShipmentExpense,
    | 'id' | 'expense_no' | 'created_at' | 'updated_at' | 'amount_sar' | 'vat_amount_sar' | 'paid_amount' | 'payment_status'
    | 'is_demo' | 'reviewed_by' | 'reviewed_at' | 'deleted_at' | 'deleted_by' | 'payment_date'
  >
>;

export interface DuplicateQuery {
  service_provider: string | null;
  invoice_no: string | null;
  category_id: string;
  original_amount: number;
  currency_code: string;
  excludeId?: string;
}

export const expensesService = {
  listAll: () =>
    fetchAll<ExpenseWithRefs>((a, b) =>
      supabase.from('shipment_expenses').select(EXPENSE_SELECT).eq('is_deleted', false).order('created_at', { ascending: false }).range(a, b),
    ),
  listForShipment: async (shipmentId: string) =>
    unwrap(
      await supabase.from('shipment_expenses').select(EXPENSE_SELECT).eq('shipment_id', shipmentId).eq('is_deleted', false).order('created_at'),
    ) as ExpenseWithRefs[],
  create: async (input: ExpenseInput) => unwrap(await supabase.from('shipment_expenses').insert(input).select(EXPENSE_SELECT).single()) as ExpenseWithRefs,
  update: async (id: string, input: ExpenseInput) => {
    const rows = unwrap(await supabase.from('shipment_expenses').update(input).eq('id', id).select(EXPENSE_SELECT)) as ExpenseWithRefs[];
    if (!rows.length) throw new Error('You do not have permission to edit this expense.');
    return rows[0];
  },
  /** Soft delete (kept for audit). Hard delete is admin-only at DB level and not exposed. */
  softDelete: async (id: string) => {
    const rows = unwrap(await supabase.from('shipment_expenses').update({ is_deleted: true }).eq('id', id).select('id')) as unknown[];
    if (!rows.length) throw new Error('You do not have permission to delete this expense.');
  },
  review: async (id: string, review_status: 'approved' | 'rejected' | 'pending', review_note?: string) => {
    const rows = unwrap(
      await supabase.from('shipment_expenses').update({ review_status, review_note: review_note ?? null }).eq('id', id).select('id'),
    ) as unknown[];
    if (!rows.length) throw new Error('You do not have permission to review this expense.');
  },
  /** Mirrors the DB duplicate guard so the user can decide before saving. */
  findDuplicates: async (q: DuplicateQuery) => {
    if (!q.invoice_no?.trim()) return [] as ExpenseWithRefs[];
    let query = supabase
      .from('shipment_expenses')
      .select(EXPENSE_SELECT)
      .eq('is_deleted', false)
      .eq('category_id', q.category_id)
      .eq('original_amount', q.original_amount)
      .eq('currency_code', q.currency_code)
      .ilike('invoice_no', q.invoice_no.trim().replace(/[%_]/g, '\\$&'));
    if (q.excludeId) query = query.neq('id', q.excludeId);
    const rows = unwrap(await query) as ExpenseWithRefs[];
    const prov = (q.service_provider ?? '').trim().toLowerCase();
    return rows.filter((r) => (r.service_provider ?? '').trim().toLowerCase() === prov);
  },
  payments: async (expenseId: string) =>
    unwrap(await supabase.from('expense_payments').select('*').eq('expense_id', expenseId).order('payment_date')) as ExpensePayment[],
  addPayment: async (input: Pick<ExpensePayment, 'expense_id' | 'payment_date' | 'amount' | 'payment_method' | 'reference' | 'notes'>) =>
    unwrap(await supabase.from('expense_payments').insert(input).select().single()) as ExpensePayment,
  deletePayment: async (id: string) => {
    const rows = unwrap(await supabase.from('expense_payments').delete().eq('id', id).select('id')) as unknown[];
    if (!rows.length) throw new Error('Only a manager or administrator can delete payments.');
  },
};
