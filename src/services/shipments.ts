import { supabase } from '@/lib/supabase';
import type { Shipment, ShipmentWithRefs } from '@/types/database';
import { fetchAll, unwrap } from './base';

export const SHIPMENT_SELECT = '*, supplier:suppliers(id,name,country), forwarder:freight_forwarders(id,name)';

export type ShipmentInput = Partial<
  Omit<Shipment, 'id' | 'shipment_code' | 'created_at' | 'updated_at' | 'doc_seq' | 'is_demo' | 'completed_at' | 'archived_at'>
>;

const EDITABLE_KEYS: (keyof ShipmentInput)[] = [
  'reference_no', 'po_number', 'supplier_id', 'supplier_invoice_no', 'supplier_invoice_date', 'country_of_origin',
  'shipping_method', 'forwarder_id', 'awb_bl_no', 'departure_date', 'expected_arrival_date', 'actual_arrival_date',
  'customs_clearance_date', 'warehouse_receiving_date', 'currency_code', 'exchange_rate', 'status', 'notes', 'assigned_to',
];

export const shipmentsService = {
  list: (opts: { includeArchived?: boolean } = {}) =>
    fetchAll<ShipmentWithRefs>((a, b) => {
      let q = supabase.from('shipments').select(SHIPMENT_SELECT).order('created_at', { ascending: false });
      if (!opts.includeArchived) q = q.eq('is_archived', false);
      return q.range(a, b);
    }),
  get: async (id: string) => unwrap(await supabase.from('shipments').select(SHIPMENT_SELECT).eq('id', id).single()) as ShipmentWithRefs,
  create: async (input: ShipmentInput) =>
    unwrap(await supabase.from('shipments').insert(input).select(SHIPMENT_SELECT).single()) as ShipmentWithRefs,
  update: async (id: string, input: ShipmentInput) => {
    const rows = unwrap(await supabase.from('shipments').update(input).eq('id', id).select(SHIPMENT_SELECT)) as ShipmentWithRefs[];
    if (!rows.length) throw new Error('You do not have permission to edit this shipment.');
    return rows[0];
  },
  /** Copies the shipment header (not expenses or documents) into a new Draft shipment. */
  duplicate: async (s: Shipment) => {
    const copy: ShipmentInput = {};
    for (const k of EDITABLE_KEYS) (copy as Record<string, unknown>)[k] = s[k as keyof Shipment];
    Object.assign(copy, {
      status: 'draft',
      supplier_invoice_no: null,
      supplier_invoice_date: null,
      awb_bl_no: null,
      departure_date: null,
      expected_arrival_date: null,
      actual_arrival_date: null,
      customs_clearance_date: null,
      warehouse_receiving_date: null,
      notes: s.notes ? `Copied from ${s.shipment_code}. ${s.notes}` : `Copied from ${s.shipment_code}.`,
    });
    return shipmentsService.create(copy);
  },
  archive: (id: string, archived: boolean) => shipmentsService.update(id, { is_archived: archived }),
  setWorkflowStep: async (id: string, step: number) => {
    const rows = unwrap(await supabase.from('shipments').update({ workflow_step: step }).eq('id', id).lt('workflow_step', step).select('id'));
    return rows;
  },
  markExported: async (id: string) => {
    unwrap(await supabase.from('shipments').update({ last_exported_at: new Date().toISOString(), workflow_step: 9 }).eq('id', id).select('id'));
  },
};
