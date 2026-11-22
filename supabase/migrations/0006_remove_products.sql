-- =====================================================================
-- 0006_remove_products.sql
-- Client decision (2026-11-22): no product lines and no item-level
-- landed cost. The key metric is total expenses as a % of the supplier
-- invoice value (category cost_group = 'product_invoice', shown as
-- "Supplier Invoice").
-- =====================================================================

drop view if exists public.v_product_landed_cost;
drop view if exists public.v_shipment_cost_summary;
drop function if exists public.save_allocations(uuid, jsonb);
drop table if exists public.expense_allocations;
drop table if exists public.shipment_products;
drop table if exists public.products;

-- Allocation settings on categories are no longer used
alter table public.expense_categories drop column if exists is_allocatable;
alter table public.expense_categories drop column if exists default_allocation_method;
delete from public.application_settings where key = 'default_allocation_method';

update public.expense_categories set name = 'Supplier Invoice' where code = 'PRODUCT_INVOICE';

-- Cost summary without product aggregates; expense % of supplier invoice
create view public.v_shipment_cost_summary
with (security_invoker = true) as
with settings as (
  select coalesce((public.get_setting('include_line_vat_in_landed_cost'))::boolean, false) as include_line_vat
),
exp as (
  select e.shipment_id,
         sum(e.amount_sar) filter (where c.cost_group = 'product_invoice') as product_invoice_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'freight')         as freight_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'insurance')       as insurance_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'customs_duty')    as customs_duty_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'import_vat')      as import_vat_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'clearance')       as clearance_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'transportation')  as transportation_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'other')           as other_sar,
         sum(e.amount_sar) filter (where c.is_recoverable_vat)             as recoverable_vat_sar,
         sum(e.amount_sar)                                                  as expenses_sar,
         sum(e.vat_amount_sar)                                              as line_vat_sar,
         sum(round((e.original_amount + e.vat_amount - e.paid_amount) * e.exchange_rate, 2))
           filter (where e.payment_status <> 'paid')                        as outstanding_sar,
         count(*)                                                           as expense_count,
         count(*) filter (where e.payment_status <> 'paid')                 as unpaid_count
    from public.shipment_expenses e
    join public.expense_categories c on c.id = e.category_id
   where not e.is_deleted
   group by e.shipment_id
),
docs as (
  select shipment_id, count(*) as document_count from public.shipment_documents where not is_deleted group by shipment_id
)
select s.id as shipment_id, s.shipment_code, s.reference_no, s.po_number, s.status, s.is_archived, s.is_demo,
       s.supplier_id, sup.name as supplier_name, sup.country as supplier_country,
       s.forwarder_id, ff.name as forwarder_name, s.country_of_origin, s.shipping_method,
       s.supplier_invoice_no, s.supplier_invoice_date, s.created_at,
       coalesce(exp.product_invoice_sar, 0) as product_invoice_sar,
       coalesce(exp.freight_sar, 0)         as freight_sar,
       coalesce(exp.insurance_sar, 0)       as insurance_sar,
       coalesce(exp.customs_duty_sar, 0)    as customs_duty_sar,
       coalesce(exp.import_vat_sar, 0)      as import_vat_sar,
       coalesce(exp.clearance_sar, 0)       as clearance_sar,
       coalesce(exp.transportation_sar, 0)  as transportation_sar,
       coalesce(exp.other_sar, 0)           as other_sar,
       coalesce(exp.line_vat_sar, 0)        as line_vat_sar,
       coalesce(exp.expenses_sar, 0) + case when st.include_line_vat then coalesce(exp.line_vat_sar, 0) else 0 end
                                            as total_landed_cost_sar,
       coalesce(exp.expenses_sar, 0) - coalesce(exp.recoverable_vat_sar, 0)
                                            as landed_cost_excl_vat_sar,
       coalesce(exp.expenses_sar, 0) + case when st.include_line_vat then coalesce(exp.line_vat_sar, 0) else 0 end
         - coalesce(exp.product_invoice_sar, 0) as additional_expense_sar,
       case when coalesce(exp.product_invoice_sar, 0) > 0 then
         round(((coalesce(exp.expenses_sar, 0) + case when st.include_line_vat then coalesce(exp.line_vat_sar, 0) else 0 end
                 - exp.product_invoice_sar) / exp.product_invoice_sar) * 100, 2) end as additional_expense_pct,
       coalesce(exp.outstanding_sar, 0) as outstanding_sar,
       coalesce(exp.expense_count, 0)   as expense_count,
       coalesce(exp.unpaid_count, 0)    as unpaid_count,
       coalesce(docs.document_count, 0) as document_count
  from public.shipments s
  cross join settings st
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.freight_forwarders ff on ff.id = s.forwarder_id
  left join exp  on exp.shipment_id  = s.id
  left join docs on docs.shipment_id = s.id;
grant select on public.v_shipment_cost_summary to authenticated;

-- remove_demo_data without product tables
create or replace function public.remove_demo_data()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  r jsonb := '{}'::jsonb;
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can remove demo data' using errcode = '42501';
  end if;
  delete from public.shipment_documents where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('shipment_documents', n);
  delete from public.expense_payments where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('expense_payments', n);
  delete from public.shipment_expenses where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('shipment_expenses', n);
  delete from public.shipments where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('shipments', n);
  update public.shipments set supplier_id = null where supplier_id in (select id from public.suppliers where is_demo);
  update public.shipments set forwarder_id = null where forwarder_id in (select id from public.freight_forwarders where is_demo);
  delete from public.suppliers where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('suppliers', n);
  delete from public.freight_forwarders where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('freight_forwarders', n);
  insert into public.audit_logs(table_name, record_id, action, summary, new_data, changed_by)
  values ('demo_data', null, 'CUSTOM', 'Demo data removed', r, auth.uid());
  return r;
end $$;

-- Mirror live rule: naiem@diamonddent-sa.com becomes admin on signup (already live)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)), new.email)
  on conflict (id) do nothing;
  insert into public.users_roles (user_id, role)
  values (new.id, case when lower(new.email) = 'naiem@diamonddent-sa.com' then 'admin' else 'employee' end)
  on conflict (user_id) do nothing;
  return new;
end $$;
