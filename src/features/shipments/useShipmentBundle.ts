import { useMemo } from 'react';
import { toCalcExpense, useCategories, useSettings, useShipment, useShipmentDocuments, useShipmentExpenses } from '@/hooks/queries';
import { analyzeShipmentCost } from '@/lib/calculations';
import { shipmentWarnings } from '@/lib/warnings';
import { WORKFLOW_STEPS } from '@/lib/constants';

export function useShipmentBundle(id: string | undefined) {
  const shipment = useShipment(id);
  const expenses = useShipmentExpenses(id);
  const documents = useShipmentDocuments(id);
  const categories = useCategories();
  const { settings } = useSettings();

  const analysis = useMemo(
    () => analyzeShipmentCost((expenses.data ?? []).map(toCalcExpense), { includeLineVat: settings.includeLineVat }),
    [expenses.data, settings.includeLineVat],
  );
  const warnings = useMemo(
    () => (shipment.data && expenses.data ? shipmentWarnings(shipment.data, expenses.data, documents.data?.length ?? null) : []),
    [shipment.data, expenses.data, documents.data],
  );

  // Stored workflow_step keeps its original numbering (review >= 6, completed >= 8, exported = 9).
  const workflow = useMemo(() => {
    const s = shipment.data;
    const exps = expenses.data ?? [];
    const done = [
      !!s,
      exps.some((e) => e.category?.cost_group === 'product_invoice'),
      exps.some((e) => e.category?.cost_group !== 'product_invoice'),
      (documents.data ?? []).length > 0,
      !!s && s.workflow_step >= 6,
      s?.status === 'completed',
      !!s?.last_exported_at,
    ];
    const current = done.findIndex((d) => !d);
    return { steps: WORKFLOW_STEPS.map((label, i) => ({ label, done: done[i] })), current: current === -1 ? WORKFLOW_STEPS.length : current };
  }, [shipment.data, expenses.data, documents.data]);

  const loading = shipment.isLoading || expenses.isLoading || categories.isLoading;
  const error = shipment.error || expenses.error || categories.error;
  return { shipment, expenses, documents, categories, settings, analysis, warnings, workflow, loading, error };
}
