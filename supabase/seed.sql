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

insert into public.expense_categories (code, name, cost_group, is_allocatable, is_recoverable_vat, default_allocation_method, sort_order, is_system) values
  ('PRODUCT_INVOICE', 'Product Invoice',        'product_invoice', false, false, 'value',        10,  true),
  ('FREIGHT',         'International Freight',  'freight',         true,  false, 'gross_weight', 20,  true),
  ('INSURANCE',       'Insurance',              'insurance',       true,  false, 'value',        30,  true),
  ('CUSTOMS_DUTY',    'Customs Duty',           'customs_duty',    true,  false, 'value',        40,  true),
  ('IMPORT_VAT',      'Import VAT',             'import_vat',      true,  true,  'value',        50,  true),
  ('CLEARANCE',       'Customs Clearance',      'clearance',       true,  false, 'value',        60,  true),
  ('SABER',           'SABER Charges',          'clearance',       true,  false, 'value',        70,  true),
  ('SFDA',            'SFDA Charges',           'clearance',       true,  false, 'value',        80,  true),
  ('TRANSPORT',       'Transportation',         'transportation',  true,  false, 'gross_weight', 90,  true),
  ('HANDLING',        'Handling Charges',       'other',           true,  false, 'quantity',     100, true),
  ('STORAGE',         'Storage Charges',        'other',           true,  false, 'gross_weight', 110, true),
  ('BANK',            'Bank Charges',           'other',           true,  false, 'value',        120, true),
  ('INSPECTION',      'Inspection Charges',     'other',           true,  false, 'value',        130, true),
  ('DOCUMENTATION',   'Documentation Charges',  'other',           true,  false, 'value',        140, true),
  ('OTHER',           'Other Expenses',         'other',           true,  false, 'value',        150, true)
on conflict (code) do nothing;

insert into public.application_settings (key, value, description) values
  ('company_name',                    '"DIAMOND DENT TRADING CO."', 'Company name shown on reports'),
  ('company_address',                 '"Riyadh, Kingdom of Saudi Arabia"', 'Address printed on the cost statement'),
  ('company_vat_number',              '""', 'Company VAT registration number'),
  ('include_line_vat_in_landed_cost', 'false', 'Add the VAT amount entered on service invoices to landed cost (default: report separately)'),
  ('show_landed_cost_excl_vat',       'true',  'Show landed cost excluding recoverable Import VAT next to the total'),
  ('employees_view_all_shipments',    'true',  'Employees can view all shipments (they can always edit only assigned/own shipments)'),
  ('default_allocation_method',       '"value"', 'Default allocation method for new categories'),
  ('google_drive_root_folder_name',   '"Diamond Dent Shipments"', 'Folder created by the app when no existing Drive folder is configured'),
  ('drive_root_folder_id',            '""', 'ID of the existing company Google Drive folder that holds the per-PO shipment folders (uses the full Drive scope)'),
  ('max_upload_mb',                   '25', 'Maximum document upload size in MB')
on conflict (key) do nothing;

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

-- ---------------- DEMO product catalogue (12 products) ----------------
insert into public.products (id, item_code, description, manufacturer, brand, hs_code, country_of_origin, unit_of_measure, unit_net_weight, unit_gross_weight, is_demo) values
  ('d3000000-0000-4000-8000-000000000001', 'DEMO-IMP-4510', 'Dental Implant Fixture 4.5 x 10 mm', 'Alpine Dental', 'AlpineFix', '9021.29', 'Germany', 'PCS', 0.012, 0.03, true),
  ('d3000000-0000-4000-8000-000000000002', 'DEMO-ABT-STR', 'Straight Titanium Abutment', 'Alpine Dental', 'AlpineFix', '9021.29', 'Germany', 'PCS', 0.008, 0.02, true),
  ('d3000000-0000-4000-8000-000000000003', 'DEMO-CMP-A2', 'Composite Resin A2, 4 g syringe', 'Alpine Dental', 'NanoFill', '3006.40', 'Germany', 'PCS', 0.01, 0.025, true),
  ('d3000000-0000-4000-8000-000000000004', 'DEMO-BND-5ML', 'Universal Bonding Agent 5 ml', 'Alpine Dental', 'NanoFill', '3006.40', 'Germany', 'PCS', 0.012, 0.03, true),
  ('d3000000-0000-4000-8000-000000000005', 'DEMO-GLV-NM', 'Nitrile Exam Gloves M (box of 100)', 'Bright Medical', 'BrightCare', '4015.19', 'China', 'BOX', 0.55, 0.62, true),
  ('d3000000-0000-4000-8000-000000000006', 'DEMO-MSK-L3', 'Surgical Face Mask Level 3 (box of 50)', 'Bright Medical', 'BrightCare', '6307.90', 'China', 'BOX', 0.25, 0.3, true),
  ('d3000000-0000-4000-8000-000000000007', 'DEMO-BUR-DIA', 'Diamond Bur Assortment (pack of 10)', 'Pacific Dental', 'ProCut', '9018.49', 'United States', 'PACK', 0.02, 0.05, true),
  ('d3000000-0000-4000-8000-000000000008', 'DEMO-ALG-500', 'Alginate Impression Material 500 g', 'Bright Medical', 'BrightCare', '3407.00', 'China', 'PCS', 0.5, 0.56, true),
  ('d3000000-0000-4000-8000-000000000009', 'DEMO-HPC-HS', 'High-Speed Dental Handpiece', 'Pacific Dental', 'ProCut', '9018.41', 'United States', 'PCS', 0.15, 0.45, true),
  ('d3000000-0000-4000-8000-000000000010', 'DEMO-ENDO-K25', 'Endodontic K-Files 25 mm (pack of 6)', 'Pacific Dental', 'EndoLine', '9018.49', 'United States', 'PACK', 0.01, 0.03, true),
  ('d3000000-0000-4000-8000-000000000011', 'DEMO-STR-PCH', 'Sterilization Pouches 90 x 230 mm (box of 200)', 'Bright Medical', 'BrightCare', '4819.40', 'China', 'BOX', 0.9, 1.0, true),
  ('d3000000-0000-4000-8000-000000000012', 'DEMO-XRY-S2', 'Intraoral X-ray Sensor, size 2', 'Alpine Dental', 'AlpineView', '9022.14', 'Germany', 'PCS', 0.2, 0.9, true)
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

-- ---------------- DEMO shipment products (13 lines) ----------------
insert into public.shipment_products (id, shipment_id, product_id, item_code, description, manufacturer, brand, hs_code, country_of_origin, quantity, unit_of_measure, unit_price, currency_code, exchange_rate, net_weight, gross_weight, lot_number, expiry_date, sort_order, is_demo) values
  ('d5000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'DEMO-IMP-4510', 'Dental Implant Fixture 4.5 x 10 mm', 'Alpine Dental', 'AlpineFix', '9021.29', 'Germany', 200, 'PCS', 85, 'EUR', 4.05, 2.4, 6.0, 'LOT-2601', '2029-02-28', 0, true),
  ('d5000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', 'DEMO-ABT-STR', 'Straight Titanium Abutment', 'Alpine Dental', 'AlpineFix', '9021.29', 'Germany', 200, 'PCS', 32, 'EUR', 4.05, 1.6, 4.0, 'LOT-2602', '2030-03-28', 1, true),
  ('d5000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000012', 'DEMO-XRY-S2', 'Intraoral X-ray Sensor, size 2', 'Alpine Dental', 'AlpineView', '9022.14', 'Germany', 4, 'PCS', 2150, 'EUR', 4.05, 0.8, 3.6, 'LOT-2603', '2028-04-28', 2, true),
  ('d5000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000005', 'DEMO-GLV-NM', 'Nitrile Exam Gloves M (box of 100)', 'Bright Medical', 'BrightCare', '4015.19', 'China', 1500, 'BOX', 4.2, 'USD', 3.75, 825.0, 930.0, 'LOT-2604', '2029-05-28', 0, true),
  ('d5000000-0000-4000-8000-000000000005', 'd4000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000006', 'DEMO-MSK-L3', 'Surgical Face Mask Level 3 (box of 50)', 'Bright Medical', 'BrightCare', '6307.90', 'China', 1200, 'BOX', 3.1, 'USD', 3.75, 300.0, 360.0, 'LOT-2605', '2030-06-28', 1, true),
  ('d5000000-0000-4000-8000-000000000006', 'd4000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000011', 'DEMO-STR-PCH', 'Sterilization Pouches 90 x 230 mm (box of 200)', 'Bright Medical', 'BrightCare', '4819.40', 'China', 800, 'BOX', 6.5, 'USD', 3.75, 720.0, 800.0, 'LOT-2606', '2028-07-28', 2, true),
  ('d5000000-0000-4000-8000-000000000007', 'd4000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000009', 'DEMO-HPC-HS', 'High-Speed Dental Handpiece', 'Pacific Dental', 'ProCut', '9018.41', 'United States', 10, 'PCS', 420, 'USD', 3.75, 1.5, 4.5, 'LOT-2607', '2029-08-28', 0, true),
  ('d5000000-0000-4000-8000-000000000008', 'd4000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000007', 'DEMO-BUR-DIA', 'Diamond Bur Assortment (pack of 10)', 'Pacific Dental', 'ProCut', '9018.49', 'United States', 100, 'PACK', 18, 'USD', 3.75, 2.0, 5.0, 'LOT-2608', '2030-09-28', 1, true),
  ('d5000000-0000-4000-8000-000000000009', 'd4000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000010', 'DEMO-ENDO-K25', 'Endodontic K-Files 25 mm (pack of 6)', 'Pacific Dental', 'EndoLine', '9018.49', 'United States', 150, 'PACK', 9.5, 'USD', 3.75, 1.5, 4.5, 'LOT-2609', '2028-01-28', 2, true),
  ('d5000000-0000-4000-8000-000000000010', 'd4000000-0000-4000-8000-000000000004', 'd3000000-0000-4000-8000-000000000003', 'DEMO-CMP-A2', 'Composite Resin A2, 4 g syringe', 'Alpine Dental', 'NanoFill', '3006.40', 'Germany', 300, 'PCS', 14, 'EUR', 4.05, 3.0, 7.5, 'LOT-2610', '2029-02-28', 0, true),
  ('d5000000-0000-4000-8000-000000000011', 'd4000000-0000-4000-8000-000000000004', 'd3000000-0000-4000-8000-000000000004', 'DEMO-BND-5ML', 'Universal Bonding Agent 5 ml', 'Alpine Dental', 'NanoFill', '3006.40', 'Germany', 120, 'PCS', 38, 'EUR', 4.05, 1.44, 3.6, 'LOT-2611', '2030-03-28', 1, true),
  ('d5000000-0000-4000-8000-000000000012', 'd4000000-0000-4000-8000-000000000005', 'd3000000-0000-4000-8000-000000000008', 'DEMO-ALG-500', 'Alginate Impression Material 500 g', 'Bright Medical', 'BrightCare', '3407.00', 'China', 400, 'PCS', 45, 'CNY', 0.52, 200.0, 224.0, 'LOT-2612', '2028-04-28', 0, true),
  ('d5000000-0000-4000-8000-000000000013', 'd4000000-0000-4000-8000-000000000005', 'd3000000-0000-4000-8000-000000000005', 'DEMO-GLV-NM', 'Nitrile Exam Gloves M (box of 100)', 'Bright Medical', 'BrightCare', '4015.19', 'China', 500, 'BOX', 28, 'CNY', 0.52, 275.0, 310.0, 'LOT-2613', '2029-05-28', 1, true)
on conflict do nothing;

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
