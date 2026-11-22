-- =====================================================================
-- supabase/seed.sql : DEMO DATA for testing  (every row has is_demo = true)
-- Remove it any time from Settings -> Demo data, or:  select public.remove_demo_data();
-- Default categories / currencies / settings come from migration 0005 and are
-- re-asserted below idempotently so this file can run on its own.
-- =====================================================================

insert into public.currencies (code, name, symbol, decimals, current_rate, is_base) values
  ('SAR', 'Saudi Riyal',        'SAR', 2, 1,       true),
  ('USD', 'US Dollar',          '$',   2, 3.750000, false),
  ('EUR', 'Euro',               '€',   2, 4.050000, false),
  ('GBP', 'British Pound',      '£',   2, 4.750000, false),
  ('AED', 'UAE Dirham',         'AED', 2, 1.021100, false),
  ('CNY', 'Chinese Yuan',       '¥',   2, 0.520000, false)
on conflict (code) do nothing;

-- expense categories and settings come from migration 0005_defaults.sql

-- ---------------- Company configuration (NOT demo data) ----------------
-- DIAMOND DENT company Google Drive folder that holds the per-PO shipment folders:
-- https://drive.google.com/drive/folders/1VlzAkc8j6FcqJpwho0RV37aRbltNYx1o
-- Only filled in when still empty, so a value changed later in Settings is never overwritten.
insert into public.application_settings (key, value, description)
values ('drive_root_folder_id', '"1VlzAkc8j6FcqJpwho0RV37aRbltNYx1o"',
        'ID of the existing company Google Drive folder that holds the per-PO shipment folders (uses the full Drive scope)')
on conflict (key) do update set value = excluded.value
 where public.application_settings.value in ('""'::jsonb, 'null'::jsonb);

-- ---------------- DEMO suppliers ----------------
insert into public.suppliers (id, name, country, city, contact_person, email, phone, default_currency, payment_terms, notes, is_demo) values
  ('d1000000-0000-4000-8000-000000000001', '[DEMO] Alpine Dental GmbH', 'Germany', 'Munich', 'Klaus Weber', 'orders@alpine-dental.example', '+49 89 1234 5678', 'EUR', 'Net 60', 'Demo record', true),
  ('d1000000-0000-4000-8000-000000000002', '[DEMO] Shenzhen Bright Medical Co., Ltd.', 'China', 'Shenzhen', 'Lily Chen', 'sales@brightmed.example', '+86 755 8888 1234', 'USD', '30% advance, 70% before shipment', 'Demo record', true),
  ('d1000000-0000-4000-8000-000000000003', '[DEMO] Pacific Dental Supply Inc.', 'United States', 'San Diego', 'Mark Ellis', 'export@pacificdental.example', '+1 619 555 0142', 'USD', 'Net 30', 'Demo record', true)
on conflict do nothing;

-- ---------------- DEMO freight forwarders ----------------
insert into public.freight_forwarders (id, name, country, contact_person, email, phone, services, notes, is_demo) values
  ('d2000000-0000-4000-8000-000000000001', '[DEMO] Gulf Express Logistics', 'Saudi Arabia', 'Ahmed Al-Harbi', 'ops@gulfexpress.example', '+966 11 400 1000', 'Air, Sea, Clearance', 'Demo record', true),
  ('d2000000-0000-4000-8000-000000000002', '[DEMO] Al Noor Freight & Clearance', 'Saudi Arabia', 'Faisal Al-Qahtani', 'clearance@alnoor.example', '+966 13 800 2000', 'Sea, Land, Clearance', 'Demo record', true),
  ('d2000000-0000-4000-8000-000000000003', '[DEMO] SkyBridge Courier Services', 'United Arab Emirates', 'Rania Haddad', 'support@skybridge.example', '+971 4 300 3000', 'Courier (DHL / FedEx)', 'Demo record', true)
on conflict do nothing;

-- ---------------- DEMO shipments (5) ----------------
insert into public.shipments (id, shipment_code, reference_no, po_number, supplier_id, supplier_invoice_no, supplier_invoice_date, country_of_origin, shipping_method, forwarder_id, awb_bl_no, departure_date, expected_arrival_date, actual_arrival_date, customs_clearance_date, warehouse_receiving_date, currency_code, exchange_rate, status, workflow_step, notes, created_at, is_demo) values
  ('d4000000-0000-4000-8000-000000000001', 'DEMO-SHP-2026-0001', 'REF-ALP-0626', 'PO-4501', 'd1000000-0000-4000-8000-000000000001', 'ALP-INV-26-1187', '2026-06-12', 'Germany', 'air', 'd2000000-0000-4000-8000-000000000001', 'AWB 176-44512093', '2026-06-20', '2026-06-23', '2026-06-23', '2026-06-26', '2026-06-28', 'EUR', 4.05, 'completed', 8, 'Demo shipment', '2026-06-12 09:00:00+03', true),
  ('d4000000-0000-4000-8000-000000000002', 'DEMO-SHP-2026-0002', 'REF-SZB-0726', 'PO-4502', 'd1000000-0000-4000-8000-000000000002', 'BM-2026-0734', '2026-07-18', 'China', 'sea', 'd2000000-0000-4000-8000-000000000002', 'BL COSU6214587410', '2026-07-28', '2026-08-25', '2026-08-27', '2026-09-02', '2026-09-04', 'USD', 3.75, 'delivered', 6, 'Demo shipment', '2026-07-18 09:00:00+03', true),
  ('d4000000-0000-4000-8000-000000000003', 'DEMO-SHP-2026-0003', 'REF-PDS-0926', 'PO-4503', 'd1000000-0000-4000-8000-000000000003', 'PDS-55821', '2026-09-22', 'United States', 'courier', 'd2000000-0000-4000-8000-000000000003', 'DHL 4458 2210 93', '2026-09-29', '2026-10-03', '2026-10-04', null, null, 'USD', 3.75, 'customs_clearance', 4, 'Demo shipment', '2026-09-22 09:00:00+03', true),
  ('d4000000-0000-4000-8000-000000000004', 'DEMO-SHP-2026-0004', 'REF-ALP-1026', 'PO-4504', 'd1000000-0000-4000-8000-000000000001', 'ALP-INV-26-1502', '2026-10-27', 'Germany', 'air', 'd2000000-0000-4000-8000-000000000001', 'AWB 176-44519981', '2026-11-10', '2026-11-25', null, null, null, 'EUR', 4.05, 'in_transit', 4, 'Demo shipment', '2026-10-27 09:00:00+03', true),
  ('d4000000-0000-4000-8000-000000000005', 'DEMO-SHP-2026-0005', 'REF-SZB-1126', 'PO-4505', 'd1000000-0000-4000-8000-000000000002', 'BM-2026-1102', '2026-11-15', 'China', 'sea', 'd2000000-0000-4000-8000-000000000002', null, null, '2026-12-30', null, null, null, 'CNY', 0.52, 'draft', 2, 'Demo shipment', '2026-11-15 09:00:00+03', true)
on conflict do nothing;

update public.shipments set completed_at = '2026-06-30 14:00:00+03'
 where shipment_code = 'DEMO-SHP-2026-0001' and is_demo;

-- ---------------- DEMO expenses (mixed currencies, paid / partial / unpaid) ----------------
insert into public.shipment_expenses (id, expense_no, shipment_id, category_id, description, service_provider, supplier_id, forwarder_id, invoice_no, invoice_date, currency_code, original_amount, exchange_rate, vat_amount, payment_method, review_status, notes, is_demo) values
  ('d6000000-0000-4000-8000-000000000001', 'DEMO-EXP-00001', 'd4000000-0000-4000-8000-000000000001', (select id from public.expense_categories where code='PRODUCT_INVOICE'), 'Supplier invoice - implants & sensors', '[DEMO] Alpine Dental GmbH', 'd1000000-0000-4000-8000-000000000001', null, 'ALP-INV-26-1187', '2026-06-12', 'EUR', 32000, 4.05, 0, 'bank_transfer', 'approved', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000002', 'DEMO-EXP-00002', 'd4000000-0000-4000-8000-000000000001', (select id from public.expense_categories where code='FREIGHT'), 'Air freight MUC-RUH', '[DEMO] Gulf Express Logistics', null, 'd2000000-0000-4000-8000-000000000001', 'GEL-F-8812', '2026-06-24', 'USD', 2400, 3.75, 0, 'bank_transfer', 'approved', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000003', 'DEMO-EXP-00003', 'd4000000-0000-4000-8000-000000000001', (select id from public.expense_categories where code='INSURANCE'), 'Cargo insurance', '[DEMO] Gulf Express Logistics', null, 'd2000000-0000-4000-8000-000000000001', 'GEL-I-8813', '2026-06-24', 'EUR', 160, 4.05, 0, 'bank_transfer', 'approved', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000004', 'DEMO-EXP-00004', 'd4000000-0000-4000-8000-000000000001', (select id from public.expense_categories where code='CUSTOMS_DUTY'), 'Customs duty 5%', 'ZATCA Customs', null, null, 'SADAD-77120345', '2026-06-25', 'SAR', 6480, 1, 0, 'sadad', 'approved', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000005', 'DEMO-EXP-00005', 'd4000000-0000-4000-8000-000000000001', (select id from public.expense_categories where code='IMPORT_VAT'), 'Import VAT 15%', 'ZATCA Customs', null, null, 'SADAD-77120346', '2026-06-25', 'SAR', 21859.2, 1, 0, 'sadad', 'approved', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000006', 'DEMO-EXP-00006', 'd4000000-0000-4000-8000-000000000001', (select id from public.expense_categories where code='CLEARANCE'), 'Clearance agent fees', '[DEMO] Gulf Express Logistics', null, 'd2000000-0000-4000-8000-000000000001', 'GEL-C-8814', '2026-06-26', 'SAR', 1500, 1, 225, 'bank_transfer', 'approved', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000007', 'DEMO-EXP-00007', 'd4000000-0000-4000-8000-000000000001', (select id from public.expense_categories where code='SFDA'), 'SFDA release fee', 'SFDA', null, null, 'SFDA-26-33410', '2026-06-25', 'SAR', 750, 1, 0, 'sadad', 'approved', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000008', 'DEMO-EXP-00008', 'd4000000-0000-4000-8000-000000000001', (select id from public.expense_categories where code='TRANSPORT'), 'Airport to warehouse transport', '[DEMO] Gulf Express Logistics', null, 'd2000000-0000-4000-8000-000000000001', 'GEL-T-8815', '2026-06-28', 'SAR', 600, 1, 90, 'bank_transfer', 'approved', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000009', 'DEMO-EXP-00009', 'd4000000-0000-4000-8000-000000000002', (select id from public.expense_categories where code='PRODUCT_INVOICE'), 'Supplier invoice - consumables', '[DEMO] Shenzhen Bright Medical Co., Ltd.', 'd1000000-0000-4000-8000-000000000002', null, 'BM-2026-0734', '2026-07-18', 'USD', 15220.0, 3.75, 0, 'bank_transfer', 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000010', 'DEMO-EXP-00010', 'd4000000-0000-4000-8000-000000000002', (select id from public.expense_categories where code='FREIGHT'), 'Sea freight SZX-DMM (1x20ft LCL)', '[DEMO] Al Noor Freight & Clearance', null, 'd2000000-0000-4000-8000-000000000002', 'ANF-24410', '2026-08-28', 'USD', 1850, 3.75, 0, 'bank_transfer', 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000011', 'DEMO-EXP-00011', 'd4000000-0000-4000-8000-000000000002', (select id from public.expense_categories where code='CUSTOMS_DUTY'), 'Customs duty', 'ZATCA Customs', null, null, 'SADAD-78145521', '2026-08-30', 'SAR', 3200, 1, 0, 'sadad', 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000012', 'DEMO-EXP-00012', 'd4000000-0000-4000-8000-000000000002', (select id from public.expense_categories where code='IMPORT_VAT'), 'Import VAT 15%', 'ZATCA Customs', null, null, 'SADAD-78145522', '2026-08-30', 'SAR', 10082, 1, 0, 'sadad', 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000013', 'DEMO-EXP-00013', 'd4000000-0000-4000-8000-000000000002', (select id from public.expense_categories where code='CLEARANCE'), 'Clearance agent fees', '[DEMO] Al Noor Freight & Clearance', null, 'd2000000-0000-4000-8000-000000000002', 'ANF-24411', '2026-09-02', 'SAR', 1200, 1, 180, null, 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000014', 'DEMO-EXP-00014', 'd4000000-0000-4000-8000-000000000002', (select id from public.expense_categories where code='TRANSPORT'), 'Port to warehouse trucking', '[DEMO] Al Noor Freight & Clearance', null, 'd2000000-0000-4000-8000-000000000002', 'ANF-24412', '2026-09-04', 'SAR', 850, 1, 127.5, null, 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000015', 'DEMO-EXP-00015', 'd4000000-0000-4000-8000-000000000002', (select id from public.expense_categories where code='STORAGE'), 'Port storage (4 days)', 'Dammam Port Terminal', null, null, 'DPT-998123', '2026-09-02', 'SAR', 400, 1, 60, null, 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000016', 'DEMO-EXP-00016', 'd4000000-0000-4000-8000-000000000003', (select id from public.expense_categories where code='PRODUCT_INVOICE'), 'Supplier invoice - instruments', '[DEMO] Pacific Dental Supply Inc.', 'd1000000-0000-4000-8000-000000000003', null, 'PDS-55821', '2026-09-22', 'USD', 7425.0, 3.75, 0, 'bank_transfer', 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000017', 'DEMO-EXP-00017', 'd4000000-0000-4000-8000-000000000003', (select id from public.expense_categories where code='FREIGHT'), 'DHL express courier', '[DEMO] SkyBridge Courier Services', null, 'd2000000-0000-4000-8000-000000000003', 'DHL-INV-6612093', '2026-10-04', 'SAR', 2350, 1, 352.5, null, 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000018', 'DEMO-EXP-00018', 'd4000000-0000-4000-8000-000000000003', (select id from public.expense_categories where code='CUSTOMS_DUTY'), 'Customs duty', 'ZATCA Customs', null, null, 'SADAD-79011234', '2026-10-05', 'SAR', 1400, 1, 0, 'sadad', 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000019', 'DEMO-EXP-00019', 'd4000000-0000-4000-8000-000000000003', (select id from public.expense_categories where code='IMPORT_VAT'), 'Import VAT 15%', 'ZATCA Customs', null, null, 'SADAD-79011235', '2026-10-05', 'SAR', 4740, 1, 0, null, 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000020', 'DEMO-EXP-00020', 'd4000000-0000-4000-8000-000000000003', (select id from public.expense_categories where code='BANK'), 'Telegraphic transfer charges', 'Local bank', null, null, 'TT-26-5521', '2026-09-23', 'SAR', 85, 1, 12.75, 'bank_transfer', 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000021', 'DEMO-EXP-00021', 'd4000000-0000-4000-8000-000000000004', (select id from public.expense_categories where code='PRODUCT_INVOICE'), 'Supplier invoice - restoratives', '[DEMO] Alpine Dental GmbH', 'd1000000-0000-4000-8000-000000000001', null, 'ALP-INV-26-1502', '2026-10-27', 'EUR', 8760, 4.05, 0, 'bank_transfer', 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000022', 'DEMO-EXP-00022', 'd4000000-0000-4000-8000-000000000004', (select id from public.expense_categories where code='FREIGHT'), 'Air freight MUC-RUH', '[DEMO] Gulf Express Logistics', null, 'd2000000-0000-4000-8000-000000000001', 'GEL-F-9120', '2026-11-10', 'USD', 950, 3.75, 0, null, 'pending', 'Demo expense', true),
  ('d6000000-0000-4000-8000-000000000023', 'DEMO-EXP-00023', 'd4000000-0000-4000-8000-000000000005', (select id from public.expense_categories where code='PRODUCT_INVOICE'), 'Proforma / supplier invoice', '[DEMO] Shenzhen Bright Medical Co., Ltd.', 'd1000000-0000-4000-8000-000000000002', null, 'BM-2026-1102', '2026-11-15', 'CNY', 32000, 0.52, 0, null, 'pending', 'Demo expense', true)
on conflict do nothing;

-- ---------------- DEMO payments (drive payment status via trigger) ----------------
insert into public.expense_payments (id, expense_id, payment_date, amount, payment_method, reference, is_demo) values
  ('d7000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', '2026-06-12', 32000, 'bank_transfer', 'DEMO-PAY-001', true),
  ('d7000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002', '2026-06-24', 2400, 'bank_transfer', 'DEMO-PAY-002', true),
  ('d7000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000003', '2026-06-24', 160, 'bank_transfer', 'DEMO-PAY-003', true),
  ('d7000000-0000-4000-8000-000000000004', 'd6000000-0000-4000-8000-000000000004', '2026-06-25', 6480, 'sadad', 'DEMO-PAY-004', true),
  ('d7000000-0000-4000-8000-000000000005', 'd6000000-0000-4000-8000-000000000005', '2026-06-25', 21859.2, 'sadad', 'DEMO-PAY-005', true),
  ('d7000000-0000-4000-8000-000000000006', 'd6000000-0000-4000-8000-000000000006', '2026-06-26', 1725, 'bank_transfer', 'DEMO-PAY-006', true),
  ('d7000000-0000-4000-8000-000000000007', 'd6000000-0000-4000-8000-000000000007', '2026-06-25', 750, 'sadad', 'DEMO-PAY-007', true),
  ('d7000000-0000-4000-8000-000000000008', 'd6000000-0000-4000-8000-000000000008', '2026-06-28', 690, 'bank_transfer', 'DEMO-PAY-008', true),
  ('d7000000-0000-4000-8000-000000000009', 'd6000000-0000-4000-8000-000000000009', '2026-07-18', 7610.0, 'bank_transfer', 'DEMO-PAY-009', true),
  ('d7000000-0000-4000-8000-000000000010', 'd6000000-0000-4000-8000-000000000010', '2026-08-28', 1850, 'bank_transfer', 'DEMO-PAY-010', true),
  ('d7000000-0000-4000-8000-000000000011', 'd6000000-0000-4000-8000-000000000011', '2026-08-30', 3200, 'sadad', 'DEMO-PAY-011', true),
  ('d7000000-0000-4000-8000-000000000012', 'd6000000-0000-4000-8000-000000000012', '2026-08-30', 10082, 'sadad', 'DEMO-PAY-012', true),
  ('d7000000-0000-4000-8000-000000000016', 'd6000000-0000-4000-8000-000000000016', '2026-09-22', 7425.0, 'bank_transfer', 'DEMO-PAY-016', true),
  ('d7000000-0000-4000-8000-000000000018', 'd6000000-0000-4000-8000-000000000018', '2026-10-05', 700, 'sadad', 'DEMO-PAY-018', true),
  ('d7000000-0000-4000-8000-000000000020', 'd6000000-0000-4000-8000-000000000020', '2026-09-23', 97.75, 'bank_transfer', 'DEMO-PAY-020', true),
  ('d7000000-0000-4000-8000-000000000021', 'd6000000-0000-4000-8000-000000000021', '2026-10-27', 2628.0, 'bank_transfer', 'DEMO-PAY-021', true)
on conflict do nothing;

-- ---------------- DEMO exchange-rate history ----------------
insert into public.exchange_rates (currency_code, rate_to_sar, effective_date, source, notes) values
  ('USD', 3.750000, '2026-06-01', 'SAMA peg', 'Demo history'),
  ('EUR', 4.050000, '2026-06-01', 'Bank', 'Demo history'),
  ('CNY', 0.520000, '2026-06-01', 'Bank', 'Demo history'),
  ('GBP', 4.750000, '2026-06-01', 'Bank', 'Demo history'),
  ('AED', 1.021100, '2026-06-01', 'Bank', 'Demo history')
on conflict (currency_code, effective_date) do nothing;
