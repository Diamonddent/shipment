-- =====================================================================
-- 0005_defaults.sql : default reference data (NOT demo data)
-- Idempotent: safe to run more than once.
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
