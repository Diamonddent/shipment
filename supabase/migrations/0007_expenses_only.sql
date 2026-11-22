-- 0007: Expenses-only model (client request 2026-11-22)
--  * No total landed cost anywhere: the key figures are Total Expenses (all costs except the
--    supplier invoice) and Total Expenses as % of the Supplier Invoice.
--  * The Supplier Invoice expense has no paid / unpaid status (payment_status = 'not_applicable',
--    no payment records allowed).
--  * Attachments stay in Google Drive; shipment_documents.expense_id links each file to its expense line.

-- 1) payment status: add not_applicable
alter table public.shipment_expenses drop constraint if exists shipment_expenses_payment_status_check;
alter table public.shipment_expenses add constraint shipment_expenses_payment_status_check
  check (payment_status in ('unpaid','partially_paid','paid','not_applicable'));

-- 2) supplier invoice lines never carry payments
delete from public.expense_payments p
 using public.shipment_expenses e, public.expense_categories c
 where p.expense_id = e.id and c.id = e.category_id and c.cost_group = 'product_invoice';

create or replace function public.shipment_expenses_invoice_no_payment()
returns trigger language plpgsql set search_path = public
as $$
begin
  if exists (select 1 from public.expense_categories c where c.id = new.category_id and c.cost_group = 'product_invoice') then
    new.payment_status := 'not_applicable';
    new.paid_amount    := 0;
    new.payment_method := null;
    new.payment_date   := null;
  end if;
  return new;
end $$;
-- runs after trg_shipment_expenses_before_write (triggers fire in name order)
drop trigger if exists trg_shipment_expenses_zz_invoice_no_payment on public.shipment_expenses;
create trigger trg_shipment_expenses_zz_invoice_no_payment before insert or update on public.shipment_expenses
  for each row execute function public.shipment_expenses_invoice_no_payment();

create or replace function public.expense_payments_before_write()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_rate numeric; v_group text;
begin
  select e.exchange_rate, c.cost_group into v_rate, v_group
    from public.shipment_expenses e join public.expense_categories c on c.id = e.category_id
   where e.id = new.expense_id;
  if v_rate is null then raise exception 'Expense not found'; end if;
  if v_group = 'product_invoice' then
    raise exception 'The supplier invoice has no payment status; payments cannot be recorded on it' using errcode = '22000';
  end if;
  new.amount_sar := round(new.amount * v_rate, 2);
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

update public.shipment_expenses e
   set payment_status = 'not_applicable', paid_amount = 0, payment_method = null, payment_date = null
  from public.expense_categories c
 where c.id = e.category_id and c.cost_group = 'product_invoice';

-- 3) settings: no landed-cost settings
update public.application_settings
   set key = 'include_line_vat_in_expenses',
       description = 'Add the VAT typed on service invoices (freight, clearance…) to total expenses. Default false.'
 where key = 'include_line_vat_in_landed_cost'
   and not exists (select 1 from public.application_settings where key = 'include_line_vat_in_expenses');
delete from public.application_settings where key in ('show_landed_cost_excl_vat', 'include_line_vat_in_landed_cost');
insert into public.application_settings (key, value, description)
values ('include_line_vat_in_expenses', 'false'::jsonb, 'Add the VAT typed on service invoices (freight, clearance…) to total expenses. Default false.')
on conflict (key) do nothing;

-- 4) summary view: supplier invoice, each cost group, total expenses, % of supplier invoice
drop view if exists public.v_shipment_cost_summary;
create view public.v_shipment_cost_summary
with (security_invoker = true) as
with settings as (
  select coalesce((public.get_setting('include_line_vat_in_expenses'))::boolean, false) as include_line_vat
),
exp as (
  select e.shipment_id,
         sum(e.amount_sar) filter (where c.cost_group = 'product_invoice') as supplier_invoice_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'freight')         as freight_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'insurance')       as insurance_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'customs_duty')    as customs_duty_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'import_vat')      as import_vat_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'clearance')       as clearance_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'transportation')  as transportation_sar,
         sum(e.amount_sar) filter (where c.cost_group = 'other')           as other_sar,
         sum(e.amount_sar) filter (where c.cost_group <> 'product_invoice') as expenses_sar,
         sum(e.vat_amount_sar) filter (where c.cost_group <> 'product_invoice') as line_vat_sar,
         sum(round((e.original_amount + e.vat_amount - e.paid_amount) * e.exchange_rate, 2))
           filter (where e.payment_status in ('unpaid','partially_paid'))  as outstanding_sar,
         count(*)                                                           as expense_count,
         count(*) filter (where e.payment_status in ('unpaid','partially_paid')) as unpaid_count
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
       coalesce(exp.supplier_invoice_sar, 0) as supplier_invoice_sar,
       coalesce(exp.freight_sar, 0)         as freight_sar,
       coalesce(exp.insurance_sar, 0)       as insurance_sar,
       coalesce(exp.customs_duty_sar, 0)    as customs_duty_sar,
       coalesce(exp.import_vat_sar, 0)      as import_vat_sar,
       coalesce(exp.clearance_sar, 0)       as clearance_sar,
       coalesce(exp.transportation_sar, 0)  as transportation_sar,
       coalesce(exp.other_sar, 0)           as other_sar,
       coalesce(exp.line_vat_sar, 0)        as line_vat_sar,
       coalesce(exp.expenses_sar, 0) + case when st.include_line_vat then coalesce(exp.line_vat_sar, 0) else 0 end
                                            as total_expenses_sar,
       case when coalesce(exp.supplier_invoice_sar, 0) > 0 then
         round(((coalesce(exp.expenses_sar, 0) + case when st.include_line_vat then coalesce(exp.line_vat_sar, 0) else 0 end)
                / exp.supplier_invoice_sar) * 100, 2) end as expenses_pct_of_invoice,
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
comment on view public.v_shipment_cost_summary is
  'Per-shipment supplier invoice, total expenses (supplier invoice excluded) and expenses % of supplier invoice, in SAR.';
grant select on public.v_shipment_cost_summary to authenticated;

notify pgrst, 'reload schema';
