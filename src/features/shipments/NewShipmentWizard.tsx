import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, FileDown, Plus } from 'lucide-react';
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Spinner, useToast } from '@/components/ui';
import { qk } from '@/hooks/queries';
import { useAuth, usePermissions } from '@/hooks/useAuth';
import { shipmentsService } from '@/services/shipments';
import { WORKFLOW_STEPS } from '@/lib/constants';
import { fmtMoney, fmtPct } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { ExpenseFormModal } from '@/features/expenses/ExpenseFormModal';
import { ExpensesTable } from '@/features/expenses/ExpensesTable';
import { ShipmentProductsTable } from '@/features/products/ShipmentProductsTable';
import { LandedCostCalculator } from '@/features/landed-cost/LandedCostCalculator';
import { DocumentUploader, DocumentsTable, DriveStatus } from '@/features/documents/DocumentsPanel';
import { generateCostStatement } from '@/features/reports/costStatement';
import { ShipmentForm } from './ShipmentForm';
import { useShipmentBundle } from './useShipmentBundle';
import { WorkflowStepper } from './WorkflowStepper';
import { CostAnalysisPanel } from './CostAnalysisPanel';

const DESCRIPTIONS = [
  'Register the shipment header: PO, supplier, currency and logistics details.',
  'Enter the supplier (product) invoice as the “Product Invoice” expense.',
  'Add each product line from the invoice / packing list.',
  'Add freight, insurance, customs duty, VAT, clearance and other charges.',
  'Upload supporting documents to Google Drive.',
  'Check the cost distribution and confirm it has been reviewed.',
  'Allocate expenses to products and save the landed cost.',
  'Mark the shipment as completed.',
  'Export the shipment cost statement for management.',
];

export default function NewShipmentWizard() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const step = id ? Math.min(9, Math.max(2, Number(params.get('step')) || 2)) : 1;
  const go = (n: number) => (n === 1 ? navigate(`/shipments/${id}`) : setParams({ step: String(n) }));

  if (!id) {
    return (
      <div>
        <PageHeader title="New shipment" subtitle="Step 1 of 9 — Create shipment" />
        <Card className="mb-5 px-3 py-2">
          <WorkflowStepper steps={WORKFLOW_STEPS.map((label) => ({ label, done: false }))} current={0} />
        </Card>
        <Card>
          <CardHeader title="1. Create shipment" subtitle={DESCRIPTIONS[0]} />
          <CardBody>
            <ShipmentForm sections="basic" submitLabel="Create & continue" onSaved={(s) => navigate(`/shipments/${s.id}/wizard?step=2`, { replace: true })} onCancel={() => navigate('/shipments')} />
          </CardBody>
        </Card>
      </div>
    );
  }
  return <WizardSteps id={id} step={step} go={go} />;
}

function WizardSteps({ id, step, go }: { id: string; step: number; go: (n: number) => void }) {
  const b = useShipmentBundle(id);
  const qc = useQueryClient();
  const toast = useToast();
  const perms = usePermissions();
  const { profile } = useAuth();
  const [expenseModal, setExpenseModal] = useState<null | 'invoice' | 'other'>(null);
  const [exporting, setExporting] = useState(false);
  const s = b.shipment.data;

  const update = useMutation({
    mutationFn: (input: Parameters<typeof shipmentsService.update>[1]) => shipmentsService.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shipment(id) });
      qc.invalidateQueries({ queryKey: qk.shipments });
    },
    onError: (e) => toast.error('Could not update shipment', e),
  });

  if (b.loading) return <Spinner className="min-h-[50vh]" />;
  if (b.error || !s) return <Card><ErrorState error={b.error ?? 'Shipment not found'} onRetry={() => b.shipment.refetch()} /></Card>;
  const canEdit = perms.canEditShipment(s);
  const expenses = b.expenses.data ?? [];
  const invoiceLines = expenses.filter((e) => e.category?.cost_group === 'product_invoice');
  const otherLines = expenses.filter((e) => e.category?.cost_group !== 'product_invoice');
  const docs = b.documents.data ?? [];

  const exportPdf = async () => {
    setExporting(true);
    try {
      await generateCostStatement({
        shipment: s,
        expenses,
        products: b.products.data ?? [],
        categories: b.categories.data ?? [],
        allocations: b.allocations.data ?? [],
        includeLineVat: b.settings.includeLineVat,
        companyName: b.settings.companyName,
        companyAddress: b.settings.companyAddress,
        preparedBy: profile?.full_name,
      });
      if (canEdit) await shipmentsService.markExported(s.id).catch(() => undefined);
      qc.invalidateQueries({ queryKey: qk.shipment(id) });
      toast.success('Cost statement exported');
    } catch (e) {
      toast.error('Could not create the PDF', errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Link to={`/shipments/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent">
          <ArrowLeft className="h-4 w-4" /> {s.shipment_code} details
        </Link>
      </div>
      <PageHeader title={`${s.shipment_code} · guided workflow`} subtitle={`Step ${step} of 9 — ${WORKFLOW_STEPS[step - 1]}`} />
      <Card className="mb-5 px-3 py-2">
        <WorkflowStepper steps={b.workflow.steps} current={step - 1} onStepClick={(i) => go(i + 1)} />
      </Card>
      {!canEdit && <Alert tone="amber" className="mb-5">You can view this shipment but not edit it (it is not assigned to you).</Alert>}

      <Card>
        <CardHeader title={`${step}. ${WORKFLOW_STEPS[step - 1]}`} subtitle={DESCRIPTIONS[step - 1]} />
        <div className={step === 7 || step === 6 ? 'p-5' : ''}>
          {step === 2 && (
            <div>
              {invoiceLines.length > 0 ? (
                <ExpensesTable rows={invoiceLines} showShipment={false} showFooter={false} />
              ) : (
                <EmptyState
                  title="No supplier invoice yet"
                  message={`Supplier invoice ${s.supplier_invoice_no ?? ''} in ${s.currency_code} — enter its total as the Product Invoice expense.`}
                  action={canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setExpenseModal('invoice')}>Enter supplier invoice</Button>}
                />
              )}
              {invoiceLines.length > 0 && canEdit && (
                <div className="border-t border-line p-4 dark:border-navy-700"><Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setExpenseModal('invoice')}>Add another invoice line</Button></div>
              )}
            </div>
          )}
          {step === 3 && <ShipmentProductsTable shipment={s} rows={b.products.data ?? []} canEdit={canEdit} />}
          {step === 4 && (
            <div>
              {canEdit && <div className="flex justify-end border-b border-line p-4 dark:border-navy-700"><Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setExpenseModal('other')}>Add expense</Button></div>}
              <ExpensesTable rows={otherLines} showShipment={false} empty={<EmptyState title="No freight or other expenses yet" message="Add freight, insurance, customs duty, import VAT, clearance, SABER/SFDA, transport, handling…" />} />
            </div>
          )}
          {step === 5 && (
            <div className="space-y-5 p-5">
              <DriveStatus />
              {canEdit && <DocumentUploader shipment={s} expenses={expenses} />}
              <div className="rounded-lg border border-line dark:border-navy-700"><DocumentsTable rows={docs} shipments={[s]} /></div>
            </div>
          )}
          {step === 6 && (
            <div className="space-y-5">
              {b.warnings.length > 0 && (
                <Alert tone="amber" title="Open warnings">
                  <ul className="list-disc pl-5">{b.warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul>
                </Alert>
              )}
              <CostAnalysisPanel analysis={b.analysis} showExclVat={b.settings.showLandedCostExclVat} />
              {canEdit && (
                s.workflow_step >= 6 ? (
                  <Alert tone="green">Cost distribution reviewed.</Alert>
                ) : (
                  <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => update.mutate({ workflow_step: 6 }, { onSuccess: () => toast.success('Review confirmed') })} loading={update.isPending}>
                    Confirm cost distribution reviewed
                  </Button>
                )
              )}
            </div>
          )}
          {step === 7 && <LandedCostCalculator shipment={s} products={b.products.data ?? []} expenses={expenses} categories={b.categories.data ?? []} saved={b.allocations.data ?? []} canEdit={canEdit} />}
          {step === 8 && (
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-4 dark:bg-navy-800"><p className="text-xs text-slate-500">Total landed cost</p><p className="text-lg font-semibold">{fmtMoney(b.analysis.totalLandedCost)}</p></div>
                <div className="rounded-lg bg-slate-50 p-4 dark:bg-navy-800"><p className="text-xs text-slate-500">Additional expense %</p><p className="text-lg font-semibold">{fmtPct(b.analysis.additionalExpensePercentage)}</p></div>
                <div className="rounded-lg bg-slate-50 p-4 dark:bg-navy-800"><p className="text-xs text-slate-500">Unpaid expenses</p><p className="text-lg font-semibold">{expenses.filter((e) => e.payment_status !== 'paid').length}</p></div>
              </div>
              {b.warnings.length > 0 ? (
                <Alert tone="amber" title={`${b.warnings.length} open warning(s)`}>
                  <ul className="list-disc pl-5">{b.warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul>
                  <p className="mt-1">Shipments may stay incomplete until all expenses are entered. You can still complete it.</p>
                </Alert>
              ) : (
                <Alert tone="green">All checks passed.</Alert>
              )}
              {s.status === 'completed' ? (
                <Alert tone="green" title="Shipment completed" />
              ) : (
                canEdit && (
                  <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => update.mutate({ status: 'completed' }, { onSuccess: () => toast.success('Shipment completed') })} loading={update.isPending}>
                    Mark shipment completed
                  </Button>
                )
              )}
            </div>
          )}
          {step === 9 && (
            <div className="space-y-4 p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                The cost statement contains the shipment details, expense analysis with percentages, additional-cost and cost-increase percentages, every expense line, payment status and the product landed costs, with sign-off lines.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button icon={<FileDown className="h-4 w-4" />} onClick={() => void exportPdf()} loading={exporting}>Export cost statement (PDF)</Button>
                <Link to={`/reports?shipment=${s.id}`}><Button variant="outline">More reports</Button></Link>
              </div>
              {s.last_exported_at && <Alert tone="green">Last exported {new Date(s.last_exported_at).toLocaleString('en-GB')}.</Alert>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-3 dark:border-navy-700">
          <Button variant="outline" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => go(step - 1)}>{step === 2 ? 'Shipment details' : 'Back'}</Button>
          {step < 9 ? (
            <Button onClick={() => go(step + 1)}>Next <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Link to={`/shipments/${id}`}><Button>Finish</Button></Link>
          )}
        </div>
      </Card>

      <ExpenseFormModal
        open={expenseModal !== null}
        onClose={() => setExpenseModal(null)}
        shipmentId={s.id}
        presetCategoryCode={expenseModal === 'invoice' ? 'PRODUCT_INVOICE' : undefined}
        presetValues={
          expenseModal === 'invoice'
            ? {
                service_provider: s.supplier?.name ?? '',
                invoice_no: s.supplier_invoice_no ?? '',
                invoice_date: s.supplier_invoice_date ?? undefined,
                currency_code: s.currency_code,
                exchange_rate: Number(s.exchange_rate),
                description: 'Supplier invoice',
              }
            : undefined
        }
      />
    </div>
  );
}
