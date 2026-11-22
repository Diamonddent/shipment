import { supabase } from '@/lib/supabase';
import type { AppSetting, AuditLog, Currency, ExchangeRate, ExpenseCategory } from '@/types/database';
import { fetchAll, unwrap } from './base';

export const categoriesService = {
  list: async () =>
    unwrap(await supabase.from('expense_categories').select('*').order('sort_order').order('name')) as ExpenseCategory[],
  create: async (input: Partial<ExpenseCategory>) =>
    unwrap(await supabase.from('expense_categories').insert(input).select().single()) as ExpenseCategory,
  update: async (id: string, input: Partial<ExpenseCategory>) =>
    unwrap(await supabase.from('expense_categories').update(input).eq('id', id).select().single()) as ExpenseCategory,
};

export const currenciesService = {
  list: async () => unwrap(await supabase.from('currencies').select('*').order('is_base', { ascending: false }).order('code')) as Currency[],
  create: async (input: Partial<Currency>) => unwrap(await supabase.from('currencies').insert(input).select().single()) as Currency,
  update: async (id: string, input: Partial<Currency>) =>
    unwrap(await supabase.from('currencies').update(input).eq('id', id).select().single()) as Currency,
  rates: (code?: string) =>
    fetchAll<ExchangeRate>((a, b) => {
      let q = supabase.from('exchange_rates').select('*').order('effective_date', { ascending: false });
      if (code) q = q.eq('currency_code', code);
      return q.range(a, b);
    }),
  addRate: async (input: { currency_code: string; rate_to_sar: number; effective_date: string; source?: string | null; notes?: string | null }) =>
    unwrap(await supabase.from('exchange_rates').insert(input).select().single()) as ExchangeRate,
  deleteRate: async (id: string) => {
    unwrap(await supabase.from('exchange_rates').delete().eq('id', id));
  },
};

export const settingsService = {
  list: async () => unwrap(await supabase.from('application_settings').select('*').order('key')) as AppSetting[],
  upsert: async (key: string, value: unknown) => {
    const existing = unwrap(await supabase.from('application_settings').select('id').eq('key', key).maybeSingle()) as { id: string } | null;
    if (existing) {
      unwrap(await supabase.from('application_settings').update({ value }).eq('id', existing.id));
    } else {
      unwrap(await supabase.from('application_settings').insert({ key, value }));
    }
  },
  removeDemoData: async () => unwrap(await supabase.rpc('remove_demo_data')) as Record<string, number>,
  demoCounts: async () => {
    const tables = ['shipments', 'suppliers', 'freight_forwarders', 'products', 'shipment_expenses'] as const;
    const res = await Promise.all(
      tables.map((t) => supabase.from(t).select('id', { count: 'exact', head: true }).eq('is_demo', true)),
    );
    return Object.fromEntries(tables.map((t, i) => [t, res[i].count ?? 0])) as Record<(typeof tables)[number], number>;
  },
};

export const auditService = {
  list: async (limit = 200, table?: string) => {
    let q = supabase.from('audit_logs').select('*').order('changed_at', { ascending: false }).limit(limit);
    if (table) q = q.eq('table_name', table);
    return unwrap(await q) as AuditLog[];
  },
  forRecord: async (recordId: string) =>
    unwrap(await supabase.from('audit_logs').select('*').eq('record_id', recordId).order('changed_at', { ascending: false }).limit(100)) as AuditLog[],
  log: async (table: string, recordId: string | null, summary: string, data?: unknown) => {
    unwrap(await supabase.rpc('log_audit_event', { p_table: table, p_record_id: recordId, p_summary: summary, p_data: data ?? null }));
  },
};
