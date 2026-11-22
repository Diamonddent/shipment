import { supabase } from '@/lib/supabase';
import type { FreightForwarder, Supplier } from '@/types/database';
import { fetchAll, unwrap } from './base';

export type SupplierInput = Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'is_demo' | 'created_by' | 'odoo_partner_id'>;
export type ForwarderInput = Omit<FreightForwarder, 'id' | 'created_at' | 'updated_at' | 'is_demo' | 'created_by' | 'odoo_partner_id'>;

export const suppliersService = {
  list: () => fetchAll<Supplier>((a, b) => supabase.from('suppliers').select('*').order('name').range(a, b)),
  create: async (input: Partial<SupplierInput>) => unwrap(await supabase.from('suppliers').insert(input).select().single()) as Supplier,
  update: async (id: string, input: Partial<SupplierInput>) =>
    unwrap(await supabase.from('suppliers').update(input).eq('id', id).select().single()) as Supplier,
  remove: async (id: string) => {
    unwrap(await supabase.from('suppliers').delete().eq('id', id));
  },
};

export const forwardersService = {
  list: () => fetchAll<FreightForwarder>((a, b) => supabase.from('freight_forwarders').select('*').order('name').range(a, b)),
  create: async (input: Partial<ForwarderInput>) =>
    unwrap(await supabase.from('freight_forwarders').insert(input).select().single()) as FreightForwarder,
  update: async (id: string, input: Partial<ForwarderInput>) =>
    unwrap(await supabase.from('freight_forwarders').update(input).eq('id', id).select().single()) as FreightForwarder,
  remove: async (id: string) => {
    unwrap(await supabase.from('freight_forwarders').delete().eq('id', id));
  },
};
