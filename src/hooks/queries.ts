/**
 * React Query hooks shared across modules. Every financial screen derives its
 * numbers from these raw rows via src/lib/calculations.ts.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { shipmentsService } from '@/services/shipments';
import { expensesService } from '@/services/expenses';
import { forwardersService, suppliersService } from '@/services/masterData';
import { categoriesService, currenciesService, settingsService } from '@/services/reference';
import { documentsService } from '@/services/documents';
import { usersService } from '@/services/users';
import { googleDrive } from '@/services/googleDrive';
import type { CostGroup, ExpenseForCalc } from '@/lib/calculations';
import { outstandingSar } from '@/lib/calculations';
import type { ExpenseWithRefs } from '@/types/database';
import { num } from '@/services/base';

export const qk = {
  shipments: ['shipments'] as const,
  shipmentsAll: ['shipments', 'all'] as const,
  shipment: (id: string) => ['shipment', id] as const,
  expenses: ['expenses'] as const,
  shipmentExpenses: (id: string) => ['expenses', 'shipment', id] as const,
  suppliers: ['suppliers'] as const,
  forwarders: ['forwarders'] as const,
  categories: ['categories'] as const,
  currencies: ['currencies'] as const,
  rates: ['rates'] as const,
  settings: ['settings'] as const,
  documents: ['documents'] as const,
  shipmentDocuments: (id: string) => ['documents', 'shipment', id] as const,
  users: ['users'] as const,
};

export const useShipments = (includeArchived = false) =>
  useQuery({ queryKey: includeArchived ? qk.shipmentsAll : qk.shipments, queryFn: () => shipmentsService.list({ includeArchived }) });
export const useShipment = (id: string | undefined) =>
  useQuery({ queryKey: qk.shipment(id ?? ''), queryFn: () => shipmentsService.get(id!), enabled: !!id });
export const useAllExpenses = () => useQuery({ queryKey: qk.expenses, queryFn: expensesService.listAll });
export const useShipmentExpenses = (id: string | undefined) =>
  useQuery({ queryKey: qk.shipmentExpenses(id ?? ''), queryFn: () => expensesService.listForShipment(id!), enabled: !!id });
export const useSuppliers = () => useQuery({ queryKey: qk.suppliers, queryFn: suppliersService.list });
export const useForwarders = () => useQuery({ queryKey: qk.forwarders, queryFn: forwardersService.list });
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: categoriesService.list, staleTime: 5 * 60_000 });
export const useCurrencies = () => useQuery({ queryKey: qk.currencies, queryFn: currenciesService.list, staleTime: 5 * 60_000 });
export const useRates = () => useQuery({ queryKey: qk.rates, queryFn: () => currenciesService.rates() });
export const useDocuments = () => useQuery({ queryKey: qk.documents, queryFn: documentsService.listAll });
export const useShipmentDocuments = (id: string | undefined) =>
  useQuery({ queryKey: qk.shipmentDocuments(id ?? ''), queryFn: () => documentsService.listForShipment(id!), enabled: !!id });
export const useUsers = () => useQuery({ queryKey: qk.users, queryFn: usersService.list });

export interface AppSettings {
  companyName: string;
  companyAddress: string;
  companyVatNumber: string;
  includeLineVat: boolean;
  showLandedCostExclVat: boolean;
  employeesViewAll: boolean;
  driveRootFolderName: string;
  driveRootFolderId: string;
  maxUploadMb: number;
  raw: Record<string, unknown>;
}

export function useSettings() {
  const q = useQuery({ queryKey: qk.settings, queryFn: settingsService.list, staleTime: 5 * 60_000 });
  const settings = useMemo<AppSettings>(() => {
    const raw = Object.fromEntries((q.data ?? []).map((s) => [s.key, s.value]));
    const str = (k: string, d: string) => (typeof raw[k] === 'string' && raw[k] ? (raw[k] as string) : d);
    const bool = (k: string, d: boolean) => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : d);
    const s: AppSettings = {
      companyName: str('company_name', 'DIAMOND DENT TRADING CO.'),
      companyAddress: str('company_address', ''),
      companyVatNumber: str('company_vat_number', ''),
      includeLineVat: bool('include_line_vat_in_landed_cost', false),
      showLandedCostExclVat: bool('show_landed_cost_excl_vat', true),
      employeesViewAll: bool('employees_view_all_shipments', true),
      driveRootFolderName: str('google_drive_root_folder_name', 'Diamond Dent Shipments'),
      driveRootFolderId: str('drive_root_folder_id', ''),
      maxUploadMb: typeof raw.max_upload_mb === 'number' ? (raw.max_upload_mb as number) : 25,
      raw,
    };
    googleDrive.configure({ rootFolderName: s.driveRootFolderName, rootFolderId: s.driveRootFolderId || null });
    return s;
  }, [q.data]);
  return { ...q, settings };
}

/** Maps an expense row to the calculation input. */
export function toCalcExpense(e: ExpenseWithRefs): ExpenseForCalc & { payment_status: ExpenseWithRefs['payment_status']; outstanding_sar: number } {
  return {
    category_id: e.category_id,
    category_name: e.category?.name ?? 'Unknown',
    cost_group: (e.category?.cost_group ?? 'other') as CostGroup,
    amount_sar: num(e.amount_sar),
    vat_amount_sar: num(e.vat_amount_sar),
    is_recoverable_vat: e.category?.is_recoverable_vat ?? false,
    is_deleted: e.is_deleted,
    payment_status: e.payment_status,
    outstanding_sar: outstandingSar(num(e.original_amount), num(e.vat_amount), num(e.paid_amount), num(e.exchange_rate)),
  };
}
