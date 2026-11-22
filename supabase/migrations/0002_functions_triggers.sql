-- =====================================================================
-- 0002_functions_triggers.sql : helpers, auto numbering, financial
-- integrity triggers, audit logging
-- =====================================================================

-- ---------------------------------------------------------------------
-- Role helpers.  NOTE: "current_role" is a reserved SQL keyword in
-- PostgreSQL, so the helper is named current_app_role().
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql stable security definer set search_path = public
as $$
  select ur.role
    from public.users_roles ur
    join public.profiles p on p.id = ur.user_id
   where ur.user_id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() = 'admin', false) $$;

create or replace function public.is_manager_or_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() in ('admin','manager'), false) $$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_app_role() is not null $$;

create or replace function public.get_setting(p_key text)
returns jsonb language sql stable security definer set search_path = public
as $$ select value from public.application_settings where key = p_key $$;

-- Can the current user see this shipment?
create or replace function public.can_view_shipment(p_shipment_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when public.is_manager_or_admin() then true
    when not public.is_active_user() then false
    else exists (
      select 1 from public.shipments s
       where s.id = p_shipment_id
         and ( coalesce((public.get_setting('employees_view_all_shipments'))::boolean, true)
               or s.assigned_to = auth.uid() or s.created_by = auth.uid() ))
  end
$$;

-- Can the current user edit this shipment (and its expenses/products/docs)?
create or replace function public.can_edit_shipment(p_shipment_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when public.is_manager_or_admin() then true
    when not public.is_active_user() then false
    else exists (
      select 1 from public.shipments s
       where s.id = p_shipment_id
         and (s.assigned_to = auth.uid() or s.created_by = auth.uid()))
  end
$$;

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','users_roles','currencies','suppliers','freight_forwarders','products',
                           'expense_categories','application_settings','shipments','shipment_products',
                           'shipment_expenses','expense_payments','shipment_documents']
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Counters
-- ---------------------------------------------------------------------
create or replace function public.next_counter(p_scope text)
returns integer language plpgsql security definer set search_path = public
as $$
declare v integer;
begin
  insert into public.code_counters(scope, last_value) values (p_scope, 1)
  on conflict (scope) do update set last_value = public.code_counters.last_value + 1, updated_at = now()
  returning last_value into v;
  return v;
end $$;
revoke all on function public.next_counter(text) from public;

-- Shipment code SHP-YYYY-NNNN
create or replace function public.shipments_before_insert()
returns trigger language plpgsql security definer set search_path = public
as $$
declare y text := to_char(coalesce(new.created_at, now()) at time zone 'Asia/Riyadh', 'YYYY');
begin
  if new.shipment_code is null or length(trim(new.shipment_code)) = 0 then
    new.shipment_code := 'SHP-' || y || '-' || lpad(public.next_counter('SHP-' || y)::text, 4, '0');
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if new.currency_code = 'SAR' then new.exchange_rate := 1; end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  if new.is_archived and new.archived_at is null then new.archived_at := now(); end if;
  return new;
end $$;
drop trigger if exists trg_shipments_before_insert on public.shipments;
create trigger trg_shipments_before_insert before insert on public.shipments
  for each row execute function public.shipments_before_insert();

-- status side effects (completed_at, archive timestamps)
create or replace function public.shipments_before_update()
returns trigger language plpgsql as $$
begin
  if new.shipment_code <> old.shipment_code then
    raise exception 'Shipment ID cannot be changed' using errcode = '22000';
  end if;
  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := now();
    new.workflow_step := greatest(new.workflow_step, 8);
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  if new.is_archived and not old.is_archived then new.archived_at := now(); end if;
  if not new.is_archived then new.archived_at := null; end if;
  if new.currency_code = 'SAR' then new.exchange_rate := 1; end if;
  return new;
end $$;
drop trigger if exists trg_shipments_before_update on public.shipments;
create trigger trg_shipments_before_update before update on public.shipments
  for each row execute function public.shipments_before_update();

-- Reserve the next document number for a shipment: DOC-<PO without dash/space>-<NNN>
create or replace function public.reserve_document_no(p_shipment_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_seq integer;
  v_po  text;
  v_code text;
begin
  if not public.can_edit_shipment(p_shipment_id) then
    raise exception 'You do not have permission to upload documents to this shipment' using errcode = '42501';
  end if;
  update public.shipments set doc_seq = doc_seq + 1
   where id = p_shipment_id
  returning doc_seq, po_number, shipment_code into v_seq, v_po, v_code;
  if v_seq is null then raise exception 'Shipment not found'; end if;
  v_po := upper(regexp_replace(coalesce(nullif(trim(v_po), ''), v_code), '[^A-Za-z0-9]', '', 'g'));
  return 'DOC-' || v_po || '-' || lpad(v_seq::text, 3, '0');
end $$;

-- ---------------------------------------------------------------------
-- Products: SAR lines must have rate 1
-- ---------------------------------------------------------------------
create or replace function public.shipment_products_normalize()
returns trigger language plpgsql as $$
begin
  if new.currency_code = 'SAR' then new.exchange_rate := 1; end if;
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_shipment_products_normalize on public.shipment_products;
create trigger trg_shipment_products_normalize before insert or update on public.shipment_products
  for each row execute function public.shipment_products_normalize();

-- ---------------------------------------------------------------------
-- Expenses: number, SAR amount, duplicate guard, review guard, status
-- ---------------------------------------------------------------------
create or replace function public.expense_payable(p_original numeric, p_vat numeric)
returns numeric language sql immutable as $$ select coalesce(p_original,0) + coalesce(p_vat,0) $$;

create or replace function public.shipment_expenses_before_write()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  y text;
  v_dup uuid;
  v_payable numeric;
begin
  if tg_op = 'INSERT' then
    y := to_char(now() at time zone 'Asia/Riyadh', 'YYYY');
    if new.expense_no is null or length(trim(new.expense_no)) = 0 then
      new.expense_no := 'EXP-' || y || '-' || lpad(public.next_counter('EXP-' || y)::text, 5, '0');
    end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
  else
    if new.expense_no <> old.expense_no then raise exception 'Expense ID cannot be changed'; end if;
    -- Only managers/admins may change review status
    if (new.review_status is distinct from old.review_status) and not public.is_manager_or_admin()
       and auth.uid() is not null then
      raise exception 'Only a manager or administrator can review expenses' using errcode = '42501';
    end if;
    if new.review_status is distinct from old.review_status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    -- An approved expense that is edited financially goes back to pending
    if old.review_status = 'approved' and new.review_status = 'approved'
       and (new.original_amount <> old.original_amount or new.exchange_rate <> old.exchange_rate
            or new.vat_amount <> old.vat_amount or new.category_id <> old.category_id) then
      new.review_status := 'pending';
      new.reviewed_at := null;
      new.reviewed_by := null;
    end if;
    if new.is_deleted and not old.is_deleted then
      new.deleted_at := now();
      new.deleted_by := auth.uid();
    end if;
  end if;

  if new.currency_code = 'SAR' then new.exchange_rate := 1; end if;
  -- Historical rate preserved: computed only from this record's own stored rate.
  new.amount_sar     := round(new.original_amount * new.exchange_rate, 2);
  new.vat_amount_sar := round(coalesce(new.vat_amount, 0) * new.exchange_rate, 2);

  -- Duplicate guard: same provider + invoice no + category + amount (non-deleted)
  if not new.is_deleted and not new.duplicate_override and coalesce(trim(new.invoice_no), '') <> '' then
    select e.id into v_dup
      from public.shipment_expenses e
     where e.id <> new.id
       and not e.is_deleted
       and lower(trim(coalesce(e.service_provider, ''))) = lower(trim(coalesce(new.service_provider, '')))
       and lower(trim(e.invoice_no)) = lower(trim(new.invoice_no))
       and e.category_id = new.category_id
       and e.original_amount = new.original_amount
       and e.currency_code = new.currency_code
     limit 1;
    if v_dup is not null then
      raise exception 'DUPLICATE_EXPENSE: an expense with the same provider, invoice number, category and amount already exists'
        using errcode = '23505', detail = v_dup::text;
    end if;
  end if;

  -- Payment status from paid amount
  v_payable := public.expense_payable(new.original_amount, new.vat_amount);
  if new.paid_amount > v_payable + 0.005 then
    raise exception 'Paid amount (%) exceeds the expense total (%)', new.paid_amount, v_payable using errcode = '22000';
  end if;
  new.payment_status := case
    when new.paid_amount <= 0 then 'unpaid'
    when new.paid_amount >= v_payable - 0.005 then 'paid'
    else 'partially_paid' end;
  return new;
end $$;
drop trigger if exists trg_shipment_expenses_before_write on public.shipment_expenses;
create trigger trg_shipment_expenses_before_write before insert or update on public.shipment_expenses
  for each row execute function public.shipment_expenses_before_write();

-- Payments: SAR amount + roll up to expense
create or replace function public.expense_payments_before_write()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_rate numeric;
begin
  select exchange_rate into v_rate from public.shipment_expenses where id = new.expense_id;
  if v_rate is null then raise exception 'Expense not found'; end if;
  new.amount_sar := round(new.amount * v_rate, 2);
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_expense_payments_before_write on public.expense_payments;
create trigger trg_expense_payments_before_write before insert or update on public.expense_payments
  for each row execute function public.expense_payments_before_write();

create or replace function public.refresh_expense_payment(p_expense_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.shipment_expenses e
     set paid_amount  = coalesce((select sum(amount) from public.expense_payments p where p.expense_id = e.id), 0),
         payment_date = (select max(payment_date) from public.expense_payments p where p.expense_id = e.id),
         payment_method = coalesce(
           (select p.payment_method from public.expense_payments p where p.expense_id = e.id
             order by p.payment_date desc, p.created_at desc limit 1), e.payment_method)
   where e.id = p_expense_id;
end $$;

create or replace function public.expense_payments_after_write()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.refresh_expense_payment(old.expense_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.refresh_expense_payment(new.expense_id); end if;
  return null;
end $$;
drop trigger if exists trg_expense_payments_after_write on public.expense_payments;
create trigger trg_expense_payments_after_write after insert or update or delete on public.expense_payments
  for each row execute function public.expense_payments_after_write();

-- ---------------------------------------------------------------------
-- Exchange rates history -> currencies.current_rate (suggestion only;
-- never touches stored expenses / products / shipments)
-- ---------------------------------------------------------------------
create or replace function public.exchange_rates_after_insert()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.created_by is null then
    update public.exchange_rates set created_by = auth.uid() where id = new.id and auth.uid() is not null;
  end if;
  update public.currencies c
     set current_rate = new.rate_to_sar
   where c.code = new.currency_code
     and c.code <> 'SAR'
     and new.effective_date >= coalesce((select max(effective_date) from public.exchange_rates r
                                          where r.currency_code = new.currency_code and r.id <> new.id), '-infinity'::date);
  return null;
end $$;
drop trigger if exists trg_exchange_rates_after_insert on public.exchange_rates;
create trigger trg_exchange_rates_after_insert after insert on public.exchange_rates
  for each row execute function public.exchange_rates_after_insert();

-- ---------------------------------------------------------------------
-- New auth user -> profile + employee role
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)), new.email)
  on conflict (id) do nothing;
  insert into public.users_roles (user_id, role) values (new.id, 'employee')
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users cannot escalate their own role; admins cannot demote the last admin
create or replace function public.users_roles_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only administrators can change user roles' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin'
     and (select count(*) from public.users_roles where role = 'admin') <= 1 then
    raise exception 'At least one administrator is required';
  end if;
  if tg_op = 'UPDATE' then new.assigned_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_users_roles_guard on public.users_roles;
create trigger trg_users_roles_guard before update on public.users_roles
  for each row execute function public.users_roles_guard();

create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() and new.is_active is distinct from old.is_active then
    raise exception 'Only administrators can activate or deactivate users' using errcode = '42501';
  end if;
  if auth.uid() is not null and new.id = auth.uid() and not new.is_active then
    raise exception 'You cannot deactivate your own account';
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- System categories keep their code/cost group (they drive the formula)
create or replace function public.expense_categories_guard()
returns trigger language plpgsql as $$
begin
  if old.is_system and (new.code <> old.code or new.cost_group <> old.cost_group) then
    raise exception 'The code and cost group of a default category cannot be changed (rename or deactivate it instead)';
  end if;
  return new;
end $$;
drop trigger if exists trg_expense_categories_guard on public.expense_categories;
create trigger trg_expense_categories_guard before update on public.expense_categories
  for each row execute function public.expense_categories_guard();

create or replace function public.prevent_delete_with_reason()
returns trigger language plpgsql as $$
begin
  raise exception '% records cannot be hard-deleted; deactivate or archive them instead', tg_table_name using errcode = '42501';
end $$;
drop trigger if exists trg_expense_categories_no_delete on public.expense_categories;
create trigger trg_expense_categories_no_delete before delete on public.expense_categories
  for each row when (old.is_system) execute function public.prevent_delete_with_reason();

-- ---------------------------------------------------------------------
-- Audit logging
-- ---------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_action text := tg_op;
  v_id text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then v_old := to_jsonb(old); v_id := v_old->>'id';
  elsif tg_op = 'INSERT' then v_new := to_jsonb(new); v_id := v_new->>'id';
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := v_new->>'id';
    if v_old - 'updated_at' = v_new - 'updated_at' then return null; end if;
    if (v_new ? 'is_archived') and (v_new->>'is_archived')::boolean and not (v_old->>'is_archived')::boolean then v_action := 'ARCHIVE';
    elsif (v_new ? 'is_archived') and not (v_new->>'is_archived')::boolean and (v_old->>'is_archived')::boolean then v_action := 'RESTORE';
    elsif (v_new ? 'is_deleted') and (v_new->>'is_deleted')::boolean and not (v_old->>'is_deleted')::boolean then v_action := 'SOFT_DELETE';
    end if;
  end if;
  insert into public.audit_logs(table_name, record_id, action, old_data, new_data, changed_by)
  values (tg_table_name, v_id, v_action, v_old, v_new, auth.uid());
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['shipments','shipment_expenses','expense_payments','shipment_products','shipment_documents',
                           'expense_categories','currencies','exchange_rates','users_roles','application_settings',
                           'suppliers','freight_forwarders','profiles']
  loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s
                    for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

create or replace function public.log_audit_event(p_table text, p_record_id text, p_summary text, p_data jsonb default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_active_user() then raise exception 'Not authorised' using errcode = '42501'; end if;
  insert into public.audit_logs(table_name, record_id, action, summary, new_data, changed_by)
  values (p_table, p_record_id, 'CUSTOM', left(p_summary, 500), p_data, auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- Save a landed-cost allocation run atomically
-- p_rows: [{category_id, shipment_product_id, method, basis_value, allocated_amount_sar}]
-- ---------------------------------------------------------------------
create or replace function public.save_allocations(p_shipment_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
  v_bad integer;
begin
  if not public.can_edit_shipment(p_shipment_id) then
    raise exception 'You do not have permission to change this shipment' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be an array'; end if;

  select count(*) into v_bad
    from jsonb_array_elements(p_rows) r
    left join public.shipment_products sp on sp.id = (r->>'shipment_product_id')::uuid and sp.shipment_id = p_shipment_id
   where sp.id is null;
  if v_bad > 0 then raise exception 'Allocation rows reference products outside this shipment'; end if;

  -- Each category's allocations must reconcile with its expense total (to the halala)
  select count(*) into v_bad from (
    select (r->>'category_id')::uuid as category_id, sum((r->>'allocated_amount_sar')::numeric) as alloc
      from jsonb_array_elements(p_rows) r group by 1
  ) a
  left join (
    select e.category_id, sum(e.amount_sar) as total
      from public.shipment_expenses e
     where e.shipment_id = p_shipment_id and not e.is_deleted
     group by 1
  ) t on t.category_id = a.category_id
  where abs(a.alloc - coalesce(t.total, 0)) > 0.001;
  if v_bad > 0 then raise exception 'Allocations do not reconcile with the shipment expense totals; recalculate and try again'; end if;

  delete from public.expense_allocations where shipment_id = p_shipment_id;
  insert into public.expense_allocations(shipment_id, category_id, shipment_product_id, method, basis_value, allocated_amount_sar, created_by)
  select p_shipment_id, (r->>'category_id')::uuid, (r->>'shipment_product_id')::uuid, r->>'method',
         coalesce((r->>'basis_value')::numeric, 0), (r->>'allocated_amount_sar')::numeric, auth.uid()
    from jsonb_array_elements(p_rows) r;
  get diagnostics v_count = row_count;

  update public.shipments set workflow_step = greatest(workflow_step, 7) where id = p_shipment_id;
  insert into public.audit_logs(table_name, record_id, action, summary, new_data, changed_by)
  values ('expense_allocations', p_shipment_id::text, 'CUSTOM', 'Landed cost allocation saved (' || v_count || ' rows)', p_rows, auth.uid());
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Remove demo data (admin only). Deletes ONLY rows flagged is_demo.
-- Real records that point at demo master data are detached first.
-- ---------------------------------------------------------------------
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

  delete from public.expense_allocations where is_demo or shipment_id in (select id from public.shipments where is_demo);
  get diagnostics n = row_count; r := r || jsonb_build_object('expense_allocations', n);
  delete from public.shipment_documents where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('shipment_documents', n);
  delete from public.expense_payments where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('expense_payments', n);
  delete from public.shipment_expenses where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('shipment_expenses', n);
  delete from public.shipment_products where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('shipment_products', n);
  delete from public.shipments where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('shipments', n);

  -- detach real records from demo master data before deleting it
  update public.shipments set supplier_id = null where supplier_id in (select id from public.suppliers where is_demo);
  update public.shipments set forwarder_id = null where forwarder_id in (select id from public.freight_forwarders where is_demo);

  delete from public.products where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('products', n);
  delete from public.suppliers where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('suppliers', n);
  delete from public.freight_forwarders where is_demo;
  get diagnostics n = row_count; r := r || jsonb_build_object('freight_forwarders', n);

  insert into public.audit_logs(table_name, record_id, action, summary, new_data, changed_by)
  values ('demo_data', null, 'CUSTOM', 'Demo data removed', r, auth.uid());
  return r;
end $$;
