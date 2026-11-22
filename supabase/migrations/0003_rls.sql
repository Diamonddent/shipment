-- =====================================================================
-- 0003_rls.sql : Row Level Security
--   admin    : full access
--   manager  : view all, edit/review shipments & expenses, all reports
--   employee : create shipments, edit assigned/own shipments and their
--              expenses/products/documents, view permitted records
-- =====================================================================

alter table public.code_counters        enable row level security;
alter table public.profiles             enable row level security;
alter table public.users_roles          enable row level security;
alter table public.currencies           enable row level security;
alter table public.exchange_rates       enable row level security;
alter table public.suppliers            enable row level security;
alter table public.freight_forwarders   enable row level security;
alter table public.products             enable row level security;
alter table public.expense_categories   enable row level security;
alter table public.application_settings enable row level security;
alter table public.shipments            enable row level security;
alter table public.shipment_products    enable row level security;
alter table public.shipment_expenses    enable row level security;
alter table public.expense_payments     enable row level security;
alter table public.expense_allocations  enable row level security;
alter table public.shipment_documents   enable row level security;
alter table public.audit_logs           enable row level security;

-- Drop existing policies so this file can be re-run safely
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- code_counters: only through security-definer functions (no policies => no direct access)

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_active_user() or id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- users_roles
create policy users_roles_select on public.users_roles for select to authenticated
  using (user_id = auth.uid() or public.is_active_user());
create policy users_roles_admin_update on public.users_roles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- reference data: everyone active reads, admin writes
create policy currencies_select on public.currencies for select to authenticated using (public.is_active_user());
create policy currencies_admin_ins on public.currencies for insert to authenticated with check (public.is_admin());
create policy currencies_admin_upd on public.currencies for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy exchange_rates_select on public.exchange_rates for select to authenticated using (public.is_active_user());
create policy exchange_rates_ins on public.exchange_rates for insert to authenticated with check (public.is_manager_or_admin());
create policy exchange_rates_del on public.exchange_rates for delete to authenticated using (public.is_admin());

create policy expense_categories_select on public.expense_categories for select to authenticated using (public.is_active_user());
create policy expense_categories_ins on public.expense_categories for insert to authenticated with check (public.is_admin());
create policy expense_categories_upd on public.expense_categories for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy application_settings_select on public.application_settings for select to authenticated using (public.is_active_user());
create policy application_settings_ins on public.application_settings for insert to authenticated with check (public.is_admin());
create policy application_settings_upd on public.application_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- master data: everyone active reads and creates, manager/admin edits, admin deletes
create policy suppliers_select on public.suppliers for select to authenticated using (public.is_active_user());
create policy suppliers_ins on public.suppliers for insert to authenticated with check (public.is_active_user());
create policy suppliers_upd on public.suppliers for update to authenticated
  using (public.is_manager_or_admin() or created_by = auth.uid()) with check (public.is_active_user());
create policy suppliers_del on public.suppliers for delete to authenticated using (public.is_admin());

create policy forwarders_select on public.freight_forwarders for select to authenticated using (public.is_active_user());
create policy forwarders_ins on public.freight_forwarders for insert to authenticated with check (public.is_active_user());
create policy forwarders_upd on public.freight_forwarders for update to authenticated
  using (public.is_manager_or_admin() or created_by = auth.uid()) with check (public.is_active_user());
create policy forwarders_del on public.freight_forwarders for delete to authenticated using (public.is_admin());

create policy products_select on public.products for select to authenticated using (public.is_active_user());
create policy products_ins on public.products for insert to authenticated with check (public.is_active_user());
create policy products_upd on public.products for update to authenticated
  using (public.is_manager_or_admin() or created_by = auth.uid()) with check (public.is_active_user());
create policy products_del on public.products for delete to authenticated using (public.is_admin());

-- shipments
-- Row-level checks use the row's own columns so INSERT ... RETURNING works for the creator
create policy shipments_select on public.shipments for select to authenticated
  using (public.is_manager_or_admin() or (public.is_active_user() and (
         coalesce((public.get_setting('employees_view_all_shipments'))::boolean, true)
         or assigned_to = auth.uid() or created_by = auth.uid())));
create policy shipments_ins on public.shipments for insert to authenticated
  with check (public.is_active_user() and (public.is_manager_or_admin() or created_by = auth.uid() or created_by is null));
create policy shipments_upd on public.shipments for update to authenticated
  using (public.is_manager_or_admin() or (public.is_active_user() and (assigned_to = auth.uid() or created_by = auth.uid())))
  with check (public.is_manager_or_admin() or (public.is_active_user() and (assigned_to = auth.uid() or created_by = auth.uid())));
create policy shipments_del on public.shipments for delete to authenticated using (public.is_admin());

-- children of shipments
create policy shipment_products_select on public.shipment_products for select to authenticated using (public.can_view_shipment(shipment_id));
create policy shipment_products_ins on public.shipment_products for insert to authenticated with check (public.can_edit_shipment(shipment_id));
create policy shipment_products_upd on public.shipment_products for update to authenticated
  using (public.can_edit_shipment(shipment_id)) with check (public.can_edit_shipment(shipment_id));
create policy shipment_products_del on public.shipment_products for delete to authenticated using (public.can_edit_shipment(shipment_id));

create policy shipment_expenses_select on public.shipment_expenses for select to authenticated using (public.can_view_shipment(shipment_id));
create policy shipment_expenses_ins on public.shipment_expenses for insert to authenticated with check (public.can_edit_shipment(shipment_id));
create policy shipment_expenses_upd on public.shipment_expenses for update to authenticated
  using (public.can_edit_shipment(shipment_id)) with check (public.can_edit_shipment(shipment_id));
-- hard delete is admin only (the app soft-deletes with is_deleted + audit log)
create policy shipment_expenses_del on public.shipment_expenses for delete to authenticated using (public.is_admin());

create policy expense_payments_select on public.expense_payments for select to authenticated
  using (exists (select 1 from public.shipment_expenses e where e.id = expense_id and public.can_view_shipment(e.shipment_id)));
create policy expense_payments_ins on public.expense_payments for insert to authenticated
  with check (exists (select 1 from public.shipment_expenses e where e.id = expense_id and public.can_edit_shipment(e.shipment_id)));
create policy expense_payments_upd on public.expense_payments for update to authenticated
  using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
create policy expense_payments_del on public.expense_payments for delete to authenticated using (public.is_manager_or_admin());

create policy expense_allocations_select on public.expense_allocations for select to authenticated using (public.can_view_shipment(shipment_id));
-- writes go through save_allocations()

create policy shipment_documents_select on public.shipment_documents for select to authenticated using (public.can_view_shipment(shipment_id));
create policy shipment_documents_ins on public.shipment_documents for insert to authenticated with check (public.can_edit_shipment(shipment_id));
create policy shipment_documents_upd on public.shipment_documents for update to authenticated
  using (public.is_manager_or_admin() or (uploaded_by = auth.uid() and public.can_edit_shipment(shipment_id)))
  with check (public.can_edit_shipment(shipment_id));
create policy shipment_documents_del on public.shipment_documents for delete to authenticated using (public.is_admin());

-- audit logs: read for managers/admins, written only by triggers / functions
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_manager_or_admin());

-- ---------------------------------------------------------------------
-- Grants (Supabase gives authenticated table privileges by default; be explicit)
-- ---------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.code_counters from authenticated, anon;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.expense_allocations from authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.remove_demo_data() from public, anon;
grant execute on function public.remove_demo_data() to authenticated;
revoke all on function public.save_allocations(uuid, jsonb) from public, anon;
grant execute on function public.save_allocations(uuid, jsonb) to authenticated;
revoke all on function public.reserve_document_no(uuid) from public, anon;
grant execute on function public.reserve_document_no(uuid) to authenticated;
revoke all on function public.log_audit_event(text, text, text, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, text, jsonb) to authenticated;
grant execute on function public.current_app_role() to authenticated;
