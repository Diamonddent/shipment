/**
 * Database row types (mirror supabase/migrations/*.sql).
 * Regenerate with `supabase gen types typescript` if you prefer generated types;
 * these hand-written types are kept deliberately close to the schema.
 */
import type { CostGroup, PaymentStatus, ShipmentStatus } from '@/lib/calculations';

export type { CostGroup, PaymentStatus, ShipmentStatus };

export type Role = 'admin' | 'manager' | 'employee';
export type ShippingMethod = 'air' | 'sea' | 'land' | 'courier';
export type PaymentMethod = 'bank_transfer' | 'sadad' | 'cash' | 'cheque' | 'credit_card' | 'letter_of_credit' | 'other';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type DocType =
  | 'supplier_invoice'
  | 'freight_invoice'
  | 'courier_invoice'
  | 'customs_declaration'
  | 'sadad_receipt'
  | 'clearance_invoice'
  | 'awb_bl'
  | 'packing_list'
  | 'certificate'
  | 'other';

interface Timestamps {
  created_at: string;
  updated_at: string;
}

export interface Profile extends Timestamps {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  is_active: boolean;
}

export interface UserRole extends Timestamps {
  id: string;
  user_id: string;
  role: Role;
  assigned_by: string | null;
}

export interface ProfileWithRole extends Profile {
  users_roles: Pick<UserRole, 'role'> | Pick<UserRole, 'role'>[] | null;
}

export interface Currency extends Timestamps {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  decimals: number;
  current_rate: number;
  is_base: boolean;
  is_active: boolean;
}

export interface ExchangeRate {
  id: string;
  currency_code: string;
  rate_to_sar: number;
  effective_date: string;
  source: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Supplier extends Timestamps {
  id: string;
  name: string;
  country: string | null;
  city: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  vat_number: string | null;
  payment_terms: string | null;
  default_currency: string | null;
  notes: string | null;
  odoo_partner_id: number | null;
  is_active: boolean;
  is_demo: boolean;
  created_by: string | null;
}

export interface FreightForwarder extends Timestamps {
  id: string;
  name: string;
  country: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  services: string | null;
  account_number: string | null;
  notes: string | null;
  odoo_partner_id: number | null;
  is_active: boolean;
  is_demo: boolean;
  created_by: string | null;
}

export interface ExpenseCategory extends Timestamps {
  id: string;
  name: string;
  code: string;
  cost_group: CostGroup;
  is_recoverable_vat: boolean;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
}

export interface AppSetting extends Timestamps {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
}

export interface Shipment extends Timestamps {
  id: string;
  shipment_code: string;
  reference_no: string | null;
  po_number: string | null;
  supplier_id: string | null;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;
  country_of_origin: string | null;
  shipping_method: ShippingMethod | null;
  forwarder_id: string | null;
  awb_bl_no: string | null;
  departure_date: string | null;
  expected_arrival_date: string | null;
  actual_arrival_date: string | null;
  customs_clearance_date: string | null;
  warehouse_receiving_date: string | null;
  currency_code: string;
  exchange_rate: number;
  status: ShipmentStatus;
  workflow_step: number;
  notes: string | null;
  assigned_to: string | null;
  completed_at: string | null;
  last_exported_at: string | null;
  doc_seq: number;
  drive_folder_id: string | null;
  odoo_picking_ref: string | null;
  is_archived: boolean;
  archived_at: string | null;
  is_demo: boolean;
  created_by: string | null;
}

export interface ShipmentWithRefs extends Shipment {
  supplier: Pick<Supplier, 'id' | 'name' | 'country'> | null;
  forwarder: Pick<FreightForwarder, 'id' | 'name'> | null;
}

export interface ShipmentExpense extends Timestamps {
  id: string;
  expense_no: string;
  shipment_id: string;
  category_id: string;
  description: string | null;
  service_provider: string | null;
  supplier_id: string | null;
  forwarder_id: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  payment_date: string | null;
  currency_code: string;
  original_amount: number;
  exchange_rate: number;
  amount_sar: number;
  vat_amount: number;
  vat_amount_sar: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  notes: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  duplicate_override: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  is_demo: boolean;
  created_by: string | null;
}

export interface ExpenseWithRefs extends ShipmentExpense {
  category: Pick<ExpenseCategory, 'id' | 'name' | 'code' | 'cost_group' | 'is_recoverable_vat'> | null;
  shipment?: Pick<Shipment, 'id' | 'shipment_code' | 'po_number' | 'status' | 'is_archived' | 'supplier_id'> | null;
}

export interface ExpensePayment extends Timestamps {
  id: string;
  expense_id: string;
  payment_date: string;
  amount: number;
  amount_sar: number;
  payment_method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  is_demo: boolean;
  created_by: string | null;
}

export interface ShipmentDocument extends Timestamps {
  id: string;
  shipment_id: string;
  expense_id: string | null;
  doc_no: string;
  doc_type: DocType;
  original_filename: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_provider: 'google_drive' | 'external_link';
  drive_file_id: string | null;
  drive_folder_id: string | null;
  drive_web_link: string | null;
  notes: string | null;
  uploaded_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  is_demo: boolean;
}

export interface DocumentWithRefs extends ShipmentDocument {
  shipment?: Pick<Shipment, 'id' | 'shipment_code' | 'po_number'> | null;
  expense?: Pick<ShipmentExpense, 'id' | 'expense_no' | 'invoice_no'> | null;
  uploader?: Pick<Profile, 'id' | 'full_name'> | null;
}

export interface AuditLog {
  id: number;
  table_name: string;
  record_id: string | null;
  action: string;
  summary: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
}
