import { useMemo } from 'react';
import {
  toCalcExpense, useAllocations, useCategories, useSettings, useShipment, useShipmentDocuments, useShipmentExpenses, useShipmentProducts,
} from '@/hooks/queries';
import { analyzeShipmentCost, toCents, sumMoney } from '@/lib/calculations';
import { shipmentWarnings } from '@/lib/warnings';
import { WORKFLOW_STEPS } from '@/lib/constants';

export function useShipmentBundle(id: string | undefined) {
  const shipment = useShipment(id);
  const expenses = useShipmentExpenses(id);
  const products = useShipmentProducts(id);
  const documents = useShipmentDocuments(id);
  const allocations = useAllocations(id);
  const categories = useCategories();
  const { settings } = useSettings();

  const analysis = useMemo(
    () => analyzeShipmentCost((expenses.data ?? []).map(toCalcExpense), { includeLineVat: settings.includeLineVat }),
    [expenses.data, settings.includeLineVat],
  );
  const warnings = useMemo(
    () => (shipment.data && expenses.data ? shipmentWarnings(shipment.data, expenses.data, products.data, documents.data?.length ?? null) : []),
    [shipment.data, expenses.data, products.data, documents.data],
  );

  const workflow = useMemo(() => {
    const s = shipment.data;
    const exps = expenses.data ?? [];
    const allocatable = exps.filter((e) => e.category?.is_allocatable);
    const allocTotal = sumMoney((allocations.data ?? []).map((a) => Number(a.allocated_amount_sar)));
    const allocCurrent =
      (allocations.data ?? []).length > 0 && toCents(allocTotal) === toCents(sumMoney(allocatable.map((e) => Number(e.amount_sar))));
    const done = [
      !!s,
      exps.some((e) => e.category?.cost_group === 'product_invoice'),
      (products.data ?? []).length > 0,
      exps.some((e) => e.category?.cost_group !== 'product_invoice'),
      (documents.data ?? []).length > 0,
      !!s && s.workflow_step >= 6,
      allocCurrent || (allocatable.length === 0 && (products.data ?? []).length > 0),
      s?.status === 'completed',
      !!s?.last_exported_at,
    ];
    const current = done.findIndex((d) => !d);
    return { steps: WORKFLOW_STEPS.map((label, i) => ({ label, done: done[i] })), current: current === -1 ? WORKFLOW_STEPS.length : current };
  }, [shipment.data, expenses.data, products.data, documents.data, allocations.data]);

  const loading = shipment.isLoading || expenses.isLoading || products.isLoading || categories.isLoading;
  const error = shipment.error || expenses.error || products.error || categories.error;
  return { shipment, expenses, products, documents, allocations, categories, settings, analysis, warnings, workflow, loading, error };
}
