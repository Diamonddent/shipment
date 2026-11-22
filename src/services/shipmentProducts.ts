import { supabase } from '@/lib/supabase';
import type { ExpenseAllocation, ShipmentProduct } from '@/types/database';
import type { AllocationRow } from '@/lib/calculations';
import { fetchAll, unwrap } from './base';

export type ShipmentProductInput = Partial<
  Omit<ShipmentProduct, 'id' | 'created_at' | 'updated_at' | 'total_invoice_value' | 'invoice_value_sar' | 'is_demo' | 'created_by'>
>;

export const shipmentProductsService = {
  listForShipment: async (shipmentId: string) =>
    unwrap(
      await supabase.from('shipment_products').select('*').eq('shipment_id', shipmentId).order('sort_order').order('created_at'),
    ) as ShipmentProduct[],
  listAll: () =>
    fetchAll<ShipmentProduct>((a, b) => supabase.from('shipment_products').select('*').order('created_at', { ascending: false }).range(a, b)),
  create: async (input: ShipmentProductInput) =>
    unwrap(await supabase.from('shipment_products').insert(input).select().single()) as ShipmentProduct,
  update: async (id: string, input: ShipmentProductInput) => {
    const rows = unwrap(await supabase.from('shipment_products').update(input).eq('id', id).select()) as ShipmentProduct[];
    if (!rows.length) throw new Error('You do not have permission to edit this product line.');
    return rows[0];
  },
  remove: async (id: string) => {
    const rows = unwrap(await supabase.from('shipment_products').delete().eq('id', id).select('id')) as unknown[];
    if (!rows.length) throw new Error('You do not have permission to remove this product line.');
  },
};

export const allocationsService = {
  listForShipment: async (shipmentId: string) =>
    unwrap(await supabase.from('expense_allocations').select('*').eq('shipment_id', shipmentId)) as ExpenseAllocation[],
  listAll: () => fetchAll<ExpenseAllocation>((a, b) => supabase.from('expense_allocations').select('*').range(a, b)),
  save: async (shipmentId: string, rows: AllocationRow[]) =>
    unwrap(await supabase.rpc('save_allocations', { p_shipment_id: shipmentId, p_rows: rows })) as number,
};
