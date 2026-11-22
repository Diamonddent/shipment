-- =====================================================================
-- 0004_views.sql : reporting views (security_invoker => RLS applies)
-- The same formulas are implemented (and unit-tested) in
-- src/lib/calculations.ts; keep both in sync.
-- =====================================================================

create or replace view public.v_shipment_cost_summary
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
prod as (
  select shipment_id, count(*) as product_count, sum(invoice_value_sar) as products_value_sar,
         sum(quantity) as total_quantity, sum(net_weight) as total_net_weight, sum(gross_weight) as total_gross_weight
    from public.shipment_products group by shipment_id
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
       coalesce(prod.product_count, 0)  as product_count,
       coalesce(prod.products_value_sar, 0) as products_value_sar,
       coalesce(docs.document_count, 0) as document_count
  from public.shipments s
  cross join settings st
  left join public.suppliers sup on sup.id = s.supplier_id
  left join public.freight_forwarders ff on ff.id = s.forwarder_id
  left join exp  on exp.shipment_id  = s.id
  left join prod on prod.shipment_id = s.id
  left join docs on docs.shipment_id = s.id;

comment on view public.v_shipment_cost_summary is
  'Per-shipment landed cost in SAR. Cancelled shipments are included here; filter status <> ''cancelled'' for normal financial summaries.';

-- Product landed cost from the saved allocation run
create or replace view public.v_product_landed_cost
with (security_invoker = true) as
select sp.id as shipment_product_id, sp.shipment_id, s.shipment_code, s.status,
       sp.item_code, sp.description, sp.quantity, sp.unit_of_measure,
       sp.invoice_value_sar,
       coalesce(sum(a.allocated_amount_sar), 0) as allocated_expenses_sar,
       sp.invoice_value_sar + coalesce(sum(a.allocated_amount_sar), 0) as landed_cost_sar,
       round((sp.invoice_value_sar + coalesce(sum(a.allocated_amount_sar), 0)) / sp.quantity, 4) as landed_cost_per_unit_sar,
       max(a.calculated_at) as calculated_at
  from public.shipment_products sp
  join public.shipments s on s.id = sp.shipment_id
  left join public.expense_allocations a on a.shipment_product_id = sp.id
 group by sp.id, s.shipment_code, s.status;

grant select on public.v_shipment_cost_summary, public.v_product_landed_cost to authenticated;
