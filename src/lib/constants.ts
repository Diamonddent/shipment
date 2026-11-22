import type { DocType, PaymentMethod, PaymentStatus, ReviewStatus, Role, ShipmentStatus, ShippingMethod } from '@/types/database';

export const COMPANY_NAME = 'DIAMOND DENT TRADING CO.';
export const APP_TITLE = 'Shipment Cost Control & Analysis';

export const SHIPMENT_STATUSES: { value: ShipmentStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'customs_clearance', label: 'Customs Clearance' },
  { value: 'delivered', label: 'Delivered to Warehouse' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];
export const SHIPMENT_STATUS_LABEL = Object.fromEntries(SHIPMENT_STATUSES.map((s) => [s.value, s.label])) as Record<ShipmentStatus, string>;

export const SHIPPING_METHODS: { value: ShippingMethod; label: string }[] = [
  { value: 'air', label: 'Air' },
  { value: 'sea', label: 'Sea' },
  { value: 'land', label: 'Land' },
  { value: 'courier', label: 'Courier' },
];
export const SHIPPING_METHOD_LABEL = Object.fromEntries(SHIPPING_METHODS.map((s) => [s.value, s.label])) as Record<ShippingMethod, string>;

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
];
export const PAYMENT_STATUS_LABEL = { ...Object.fromEntries(PAYMENT_STATUSES.map((s) => [s.value, s.label])), not_applicable: '—' } as Record<PaymentStatus, string>;

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'sadad', label: 'SADAD' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'letter_of_credit', label: 'Letter of Credit' },
  { value: 'other', label: 'Other' },
];
export const PAYMENT_METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((s) => [s.value, s.label])) as Record<PaymentMethod, string>;

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' };

export const DOC_TYPES: { value: DocType; label: string; fileLabel: string }[] = [
  { value: 'supplier_invoice', label: 'Supplier Invoice', fileLabel: 'Supplier-Invoice' },
  { value: 'freight_invoice', label: 'Freight Invoice', fileLabel: 'Freight-Invoice' },
  { value: 'courier_invoice', label: 'DHL / FedEx Invoice', fileLabel: 'Courier-Invoice' },
  { value: 'customs_declaration', label: 'Customs Declaration', fileLabel: 'Customs-Declaration' },
  { value: 'sadad_receipt', label: 'SADAD Payment Receipt', fileLabel: 'SADAD-Receipt' },
  { value: 'clearance_invoice', label: 'Clearance Agent Invoice', fileLabel: 'Clearance-Invoice' },
  { value: 'awb_bl', label: 'AWB / BL Document', fileLabel: 'AWB-BL' },
  { value: 'packing_list', label: 'Packing List', fileLabel: 'Packing-List' },
  { value: 'certificate', label: 'Certificate', fileLabel: 'Certificate' },
  { value: 'other', label: 'Other Supporting Document', fileLabel: 'Other' },
];
export const DOC_TYPE_LABEL = Object.fromEntries(DOC_TYPES.map((d) => [d.value, d.label])) as Record<DocType, string>;
export const DOC_TYPE_FILE_LABEL = Object.fromEntries(DOC_TYPES.map((d) => [d.value, d.fileLabel])) as Record<DocType, string>;

export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const ALLOWED_UPLOAD_EXT = ['pdf', 'jpg', 'jpeg', 'png'];

export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrator', manager: 'Manager', employee: 'Employee' };

export const COUNTRIES = [
  'China', 'Germany', 'United States', 'United Kingdom', 'Italy', 'Switzerland', 'France', 'Japan', 'South Korea', 'India',
  'United Arab Emirates', 'Saudi Arabia', 'Turkey', 'Spain', 'Netherlands', 'Sweden', 'Austria', 'Belgium', 'Brazil',
  'Canada', 'Israel', 'Liechtenstein', 'Malaysia', 'Pakistan', 'Poland', 'Singapore', 'Taiwan', 'Thailand', 'Vietnam', 'Egypt', 'Jordan',
];

export const WORKFLOW_STEPS = [
  'Create Shipment',
  'Supplier Invoice',
  'Freight & Expenses',
  'Documents',
  'Review Costs',
  'Complete',
  'Export Report',
];
