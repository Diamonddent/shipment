-- =====================================================================
-- DIAMOND DENT TRADING CO. — Shipment Cost Control & Analysis
-- 0001_schema.sql : tables, constraints, indexes
-- Target: Supabase (PostgreSQL 15+)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Generic counters (shipment codes per year, expense numbers per year)
-- ---------------------------------------------------------------------
create table if not exists public.code_counters (
  scope       text primary key,           -- e.g. 'SHP-2026', 'EXP-2026'
  last_value  integer not null default 0 check (last_value >= 0),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  job_title   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.users_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles(id) on delete cascade,
  role        text not null default 'employee' check (role in ('admin', 'manager', 'employee')),
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------
create table if not exists public.currencies (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z]{3}$'),
  name          text not null,
  symbol        text,
  decimals      smallint not null default 2 check (decimals between 0 and 4),
  current_rate  numeric(18,6) not null default 1 check (current_rate > 0), -- 1 unit = X SAR (default suggestion only)
  is_base       boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint currencies_base_is_sar check (not is_base or (code = 'SAR' and current_rate = 1))
);

create table if not exists public.exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  currency_code  text not null references public.currencies(code) on update cascade on delete restrict,
  rate_to_sar    numeric(18,6) not null check (rate_to_sar > 0),
  effective_date date not null default current_date,
  source         text,
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (currency_code, effective_date)
);

create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  country         text,
  city            text,
  contact_person  text,
  email           text,
  phone           text,
  address         text,
  vat_number      text,
  payment_terms   text,
  default_currency text references public.currencies(code) on update cascade,
  notes           text,
  odoo_partner_id integer,          -- reserved for future Odoo ERP sync
  is_active       boolean not null default true,
  is_demo         boolean not null default false,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists suppliers_name_uq on public.suppliers (lower(trim(name)));

create table if not exists public.freight_forwarders (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  country         text,
  contact_person  text,
  email           text,
  phone           text,
  services        text,             -- e.g. Air, Sea, Courier, Clearance
  account_number  text,
  notes           text,
  odoo_partner_id integer,
  is_active       boolean not null default true,
  is_demo         boolean not null default false,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists freight_forwarders_name_uq on public.freight_forwarders (lower(trim(name)));

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  item_code         text not null check (length(trim(item_code)) > 0),
  description       text not null,
  manufacturer      text,
  brand             text,
  hs_code           text,
  country_of_origin text,
  unit_of_measure   text not null default 'PCS',
  default_unit_price numeric(18,4) check (default_unit_price is null or default_unit_price >= 0),
  default_currency  text references public.currencies(code) on update cascade,
  unit_net_weight   numeric(14,4) check (unit_net_weight is null or unit_net_weight >= 0),
  unit_gross_weight numeric(14,4) check (unit_gross_weight is null or unit_gross_weight >= 0),
  sfda_registration text,
  odoo_product_id   integer,
  is_active         boolean not null default true,
  is_demo           boolean not null default false,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists products_item_code_uq on public.products (lower(trim(item_code)));

create table if not exists public.expense_categories (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (length(trim(name)) > 0),
  code                      text not null unique check (code ~ '^[A-Z0-9_]+$'),
  -- reporting group used by the dashboard distribution and landed-cost formula
  cost_group                text not null default 'other' check (cost_group in
                              ('product_invoice','freight','insurance','customs_duty','import_vat','clearance','transportation','other')),
  is_allocatable            boolean not null default true,      -- product invoice = false
  is_recoverable_vat        boolean not null default false,     -- Import VAT = true (input VAT)
  default_allocation_method text not null default 'value' check (default_allocation_method in
                              ('value','quantity','net_weight','gross_weight','manual')),
  sort_order                integer not null default 100,
  is_system                 boolean not null default false,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create unique index if not exists expense_categories_name_uq on public.expense_categories (lower(trim(name)));

create table if not exists public.application_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z0-9_]+$'),
  value       jsonb not null default 'null'::jsonb,
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Shipments
-- ---------------------------------------------------------------------
create table if not exists public.shipments (
  id                       uuid primary key default gen_random_uuid(),
  shipment_code            text not null unique,  -- SHP-YYYY-NNNN (auto)
  reference_no             text,
  po_number                text,
  supplier_id              uuid references public.suppliers(id) on delete restrict,
  supplier_invoice_no      text,
  supplier_invoice_date    date,
  country_of_origin        text,
  shipping_method          text check (shipping_method in ('air','sea','land','courier')),
  forwarder_id             uuid references public.freight_forwarders(id) on delete restrict,
  awb_bl_no                text,
  departure_date           date,
  expected_arrival_date    date,
  actual_arrival_date      date,
  customs_clearance_date   date,
  warehouse_receiving_date date,
  currency_code            text not null default 'SAR' references public.currencies(code) on update cascade,
  exchange_rate            numeric(18,6) not null default 1 check (exchange_rate > 0),
  status                   text not null default 'draft' check (status in
                             ('draft','preparing','in_transit','arrived','customs_clearance','delivered','completed','cancelled')),
  workflow_step            smallint not null default 1 check (workflow_step between 1 and 9),
  notes                    text,
  assigned_to              uuid references public.profiles(id) on delete set null,
  completed_at             timestamptz,
  last_exported_at         timestamptz,
  doc_seq                  integer not null default 0 check (doc_seq >= 0), -- per-shipment document counter
  drive_folder_id          text,
  odoo_picking_ref         text,
  is_archived              boolean not null default false,
  archived_at              timestamptz,
  is_demo                  boolean not null default false,
  created_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint shipments_sar_rate check (currency_code <> 'SAR' or exchange_rate = 1),
  constraint shipments_arrival_after_departure check
    (departure_date is null or actual_arrival_date is null or actual_arrival_date >= departure_date)
);
create index if not exists shipments_supplier_idx  on public.shipments (supplier_id);
create index if not exists shipments_forwarder_idx on public.shipments (forwarder_id);
create index if not exists shipments_status_idx    on public.shipments (status) where not is_archived;
create index if not exists shipments_invoice_date_idx on public.shipments (supplier_invoice_date);
create index if not exists shipments_created_idx   on public.shipments (created_at desc);
create index if not exists shipments_po_idx        on public.shipments (po_number);
create index if not exists shipments_assigned_idx  on public.shipments (assigned_to);

create table if not exists public.shipment_products (
  id                  uuid primary key default gen_random_uuid(),
  shipment_id         uuid not null references public.shipments(id) on delete cascade,
  product_id          uuid references public.products(id) on delete set null,
  item_code           text not null,
  description         text not null,
  manufacturer        text,
  brand               text,
  hs_code             text,
  country_of_origin   text,
  quantity            numeric(14,3) not null check (quantity > 0),
  unit_of_measure     text not null default 'PCS',
  unit_price          numeric(18,4) not null check (unit_price >= 0),
  currency_code       text not null references public.currencies(code) on update cascade,
  exchange_rate       numeric(18,6) not null check (exchange_rate > 0),
  total_invoice_value numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored,
  invoice_value_sar   numeric(18,2) generated always as (round(quantity * unit_price * exchange_rate, 2)) stored,
  net_weight          numeric(14,3) check (net_weight is null or net_weight >= 0),   -- total kg for the line
  gross_weight        numeric(14,3) check (gross_weight is null or gross_weight >= 0), -- total kg for the line
  volume_cbm          numeric(12,4) check (volume_cbm is null or volume_cbm >= 0),
  lot_number          text,
  expiry_date         date,
  sort_order          integer not null default 0,
  is_demo             boolean not null default false,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint shipment_products_sar_rate check (currency_code <> 'SAR' or exchange_rate = 1)
);
create index if not exists shipment_products_shipment_idx on public.shipment_products (shipment_id);
create index if not exists shipment_products_product_idx  on public.shipment_products (product_id);

-- ---------------------------------------------------------------------
-- Expenses & payments
-- ---------------------------------------------------------------------
create table if not exists public.shipment_expenses (
  id                 uuid primary key default gen_random_uuid(),
  expense_no         text not null unique,  -- EXP-YYYY-NNNNN (auto)
  shipment_id        uuid not null references public.shipments(id) on delete cascade,
  category_id        uuid not null references public.expense_categories(id) on delete restrict,
  description        text,
  service_provider   text,
  supplier_id        uuid references public.suppliers(id) on delete set null,
  forwarder_id       uuid references public.freight_forwarders(id) on delete set null,
  invoice_no         text,
  invoice_date       date,
  payment_date       date,               -- latest payment date (maintained from expense_payments)
  currency_code      text not null references public.currencies(code) on update cascade,
  original_amount    numeric(18,2) not null check (original_amount >= 0),
  exchange_rate      numeric(18,6) not null check (exchange_rate > 0), -- rate at entry time, never rewritten by settings
  amount_sar         numeric(18,2) not null default 0,                 -- = round(original_amount * exchange_rate, 2)
  vat_amount         numeric(18,2) not null default 0 check (vat_amount >= 0), -- service-invoice VAT, original currency
  vat_amount_sar     numeric(18,2) not null default 0,
  paid_amount        numeric(18,2) not null default 0 check (paid_amount >= 0), -- original currency, from expense_payments
  payment_status     text not null default 'unpaid' check (payment_status in ('unpaid','partially_paid','paid')),
  payment_method     text check (payment_method in ('bank_transfer','sadad','cash','cheque','credit_card','letter_of_credit','other')),
  notes              text,
  review_status      text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  reviewed_by        uuid references public.profiles(id) on delete set null,
  reviewed_at        timestamptz,
  review_note        text,
  duplicate_override boolean not null default false,
  is_deleted         boolean not null default false,
  deleted_at         timestamptz,
  deleted_by         uuid references public.profiles(id) on delete set null,
  is_demo            boolean not null default false,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint shipment_expenses_sar_rate check (currency_code <> 'SAR' or exchange_rate = 1),
  constraint shipment_expenses_amount_sar check (amount_sar = round(original_amount * exchange_rate, 2))
);
create index if not exists shipment_expenses_shipment_idx on public.shipment_expenses (shipment_id) where not is_deleted;
create index if not exists shipment_expenses_category_idx on public.shipment_expenses (category_id);
create index if not exists shipment_expenses_status_idx   on public.shipment_expenses (payment_status) where not is_deleted;
create index if not exists shipment_expenses_invoice_idx  on public.shipment_expenses (lower(coalesce(invoice_no,'')));
create index if not exists shipment_expenses_date_idx     on public.shipment_expenses (invoice_date);

create table if not exists public.expense_payments (
  id            uuid primary key default gen_random_uuid(),
  expense_id    uuid not null references public.shipment_expenses(id) on delete cascade,
  payment_date  date not null default current_date,
  amount        numeric(18,2) not null check (amount > 0),  -- in the expense's currency
  amount_sar    numeric(18,2) not null default 0,           -- at the expense's stored exchange rate
  payment_method text check (payment_method in ('bank_transfer','sadad','cash','cheque','credit_card','letter_of_credit','other')),
  reference     text,
  notes         text,
  is_demo       boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists expense_payments_expense_idx on public.expense_payments (expense_id);

-- ---------------------------------------------------------------------
-- Allocations (saved landed-cost calculation per shipment)
-- ---------------------------------------------------------------------
create table if not exists public.expense_allocations (
  id                    uuid primary key default gen_random_uuid(),
  shipment_id           uuid not null references public.shipments(id) on delete cascade,
  category_id           uuid not null references public.expense_categories(id) on delete restrict,
  shipment_product_id   uuid not null references public.shipment_products(id) on delete cascade,
  method                text not null check (method in ('value','quantity','net_weight','gross_weight','manual')),
  basis_value           numeric(20,6) not null default 0, -- value/qty/kg or manual share used
  allocated_amount_sar  numeric(18,2) not null,
  calculated_at         timestamptz not null default now(),
  created_by            uuid references public.profiles(id) on delete set null,
  is_demo               boolean not null default false,
  unique (shipment_id, category_id, shipment_product_id)
);
create index if not exists expense_allocations_shipment_idx on public.expense_allocations (shipment_id);

-- ---------------------------------------------------------------------
-- Documents (files live in Google Drive; metadata here)
-- ---------------------------------------------------------------------
create table if not exists public.shipment_documents (
  id                uuid primary key default gen_random_uuid(),
  shipment_id       uuid not null references public.shipments(id) on delete cascade,
  expense_id        uuid references public.shipment_expenses(id) on delete set null,
  doc_no            text not null unique,  -- DOC-<PO without dash>-<NNN>
  doc_type          text not null check (doc_type in (
                      'supplier_invoice','freight_invoice','courier_invoice','customs_declaration','sadad_receipt',
                      'clearance_invoice','awb_bl','packing_list','certificate','other')),
  original_filename text not null,
  file_name         text not null,
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),
  storage_provider  text not null default 'google_drive' check (storage_provider in ('google_drive','external_link')),
  drive_file_id     text,
  drive_folder_id   text,
  drive_web_link    text,
  notes             text,
  uploaded_by       uuid references public.profiles(id) on delete set null,
  is_deleted        boolean not null default false,
  deleted_at        timestamptz,
  deleted_by        uuid references public.profiles(id) on delete set null,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists shipment_documents_shipment_idx on public.shipment_documents (shipment_id) where not is_deleted;
create index if not exists shipment_documents_expense_idx  on public.shipment_documents (expense_id);

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('INSERT','UPDATE','DELETE','ARCHIVE','RESTORE','SOFT_DELETE','CUSTOM')),
  summary     text,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index if not exists audit_logs_table_record_idx on public.audit_logs (table_name, record_id);
create index if not exists audit_logs_changed_at_idx   on public.audit_logs (changed_at desc);
