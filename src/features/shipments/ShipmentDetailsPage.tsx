import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive, ArchiveRestore, ArrowLeft, CheckCircle2, ClipboardCheck, Copy, FileDown, History, MoreHorizontal, Pencil, Plus, Wand2,
} from 'lucide-react';
import {
  Alert, Button, Card, CardBody, CardHeader, ConfirmDialog, DemoBadge, Dropdown, EmptyState, ErrorState, Modal, Select, ShipmentStatusPill, Spinner, Tabs, useToast,
} from '@/components/ui';
import { qk } from '@/hooks/queries';
import { useAuth, usePermissions } from '@/hooks/useAuth';
import { shipmentsService } from '@/services/shipments';
import { auditService } from '@/services/reference';
import { SHIPMENT_STATUSES, SHIPMENT_STATUS_LABEL, SHIPPING_METHOD_LABEL } from '@/lib/constants';
import { fmtDate, fmtDateTime, fmtMoney, fmtPct, fmtRate } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import type { ShipmentStatus } from '@/types/database';
import { ExpensesTable } from '@/features/expenses/ExpensesTable';
import { ExpenseFormModal } from '@/features/expenses/ExpenseFormModal';
import { DocumentUploader, DocumentsTable, DriveStatus, ZipButton } from '@/features/documents/DocumentsPanel';
import { generateCostStatement } from '@/features/reports/costStatement';
import { ShipmentForm } from './ShipmentForm';
import { useShipmentBundle } from './useShipmentBundle';
import { WorkflowStepper } from './WorkflowStepper';
import { CostAnalysisPanel } from './CostAnalysisPanel';

type Tab = 'overview' | 'expenses' | 'documents' | 'history';

export default function ShipmentDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  const qc = useQueryClient();
  const toast = useToast();
  const perms = usePermissions();
  const { profile } = useAuth();
  const b = useShipmentBundle(id);
  const [editing, setEditing] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive' | 'restore' | 'complete' | 'duplicate'>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<ShipmentStatus>('draft');
  const [exporting, setExporting] = useState(false);

  const s = b.shipment.data;
  const canEdit = perms.canEditShipment(s);
  const history = useQuery({ queryKey: ['audit', id], queryFn: () => auditService.forRecord(id!), enabled: !!id && tab === 'history' && perms.canViewAudit });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.shipment(id!) });
    qc.invalidateQueries({ queryKey: qk.shipments });
    qc.invalidateQueries({ queryKey: qk.shipmentsAll });
  };

  const action = useMutation({
    mutationFn: async (kind: 'archive' | 'restore' | 'complete' | 'duplicate' | 'review' | { status: ShipmentStatus }) => {
      if (!s) return null;
      if (kind === 'archive') return shipmentsService.archive(s.id, true);
      if (kind === 'restore') return shipmentsService.archive(s.id, false);
      if (kind === 'complete') return shipmentsService.update(s.id, { status: 'completed' });
      if (kind === 'review') return shipmentsService.update(s.id, { workflow_step: Math.max(6, s.workflow_step) });
      if (kind === 'duplicate') return shipmentsService.duplicate(s);
      return shipmentsService.update(s.id, { status: kind.status });
    },
    onSuccess: (res, kind) => {
      invalidate();
      setConfirm(null);
      setStatusOpen(false);
      if (kind === 'duplicate' && res) {
        toast.success(`Duplicated as ${res.shipment_code}`, 'Header copied; add its own invoice and expenses.');
        navigate(`/shipments/${res.id}`);
      } else if (kind === 'archive') toast.success('Shipment archived');
      else if (kind === 'restore') toast.success('Shipment restored');
      else if (kind === 'complete') toast.success('Shipment marked as completed');
      else if (kind === 'review') toast.success('Cost distribution marked as reviewed');
      else toast.success('Status updated');
    },
    onError: (e) => toast.error('Action failed', e),
  });

  const exportStatement = async () => {
    if (!s) return;
    setExporting(true);
    try {
      await generateCostStatement({
        shipment: s,
        expenses: b.expenses.data ?? [],
        categories: b.categories.data ?? [],
        includeLineVat: b.settings.includeLineVat,
        companyName: b.settings.companyName,
        companyAddress: b.settings.companyAddress,
        preparedBy: profile?.full_name,
      });
      if (canEdit) {
        await shipmentsService.markExported(s.id).catch(() => undefined);
        invalidate();
      }
    } catch (e) {
      toast.error('Could not create the PDF', errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  if (b.loading) return <Spinner className="min-h-[50vh]" label="Loading shipment…" />;
  if (b.error || !s)
    return (
      <Card>
        <ErrorState error={b.error ?? 'Shipment not found or you do not have access to it.'} onRetry={() => b.shipment.refetch()} />
      </Card>
    );

  const expenses = b.expenses.data ?? [];
  const docs = b.documents.data ?? [];

  return (
    <div>
      <div className="mb-4">
        <Link to="/shipments" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent">
          <ArrowLeft className="h-4 w-4" /> Shipment register
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{s.shipment_code}</h1>
            <ShipmentStatusPill status={s.status} />
            <DemoBadge show={s.is_demo} />
            {s.is_archived && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">Archived</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            PO {s.po_number ?? '—'} · {s.supplier?.name ?? 'No supplier'} · {s.country_of_origin ?? '—'} · {s.shipping_method ? SHIPPING_METHOD_LABEL[s.shipping_method] : '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<FileDown className="h-4 w-4" />} onClick={() => void exportStatement()} loading={exporting}>
            Cost statement PDF
          </Button>
          {canEdit && s.status !== 'completed' && s.status !== 'cancelled' && (
            <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setConfirm('complete')}>Mark completed</Button>
          )}
          <Dropdown
            trigger={<Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>}
            items={[
              { label: 'Edit shipment', icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(true), hidden: !canEdit },
              { label: 'Change status', icon: <ClipboardCheck className="h-4 w-4" />, onClick: () => { setNewStatus(s.status); setStatusOpen(true); }, hidden: !canEdit },
              { label: 'Guided workflow', icon: <Wand2 className="h-4 w-4" />, onClick: () => navigate(`/shipments/${s.id}/wizard`), hidden: !canEdit },
              { label: 'Duplicate', icon: <Copy className="h-4 w-4" />, onClick: () => setConfirm('duplicate') },
              { label: 'Archive', icon: <Archive className="h-4 w-4" />, onClick: () => setConfirm('archive'), hidden: !canEdit || s.is_archived, danger: true },
              { label: 'Restore from archive', icon: <ArchiveRestore className="h-4 w-4" />, onClick: () => setConfirm('restore'), hidden: !canEdit || !s.is_archived },
            ]}
          />
        </div>
      </div>

      <Card className="mb-5 px-3 py-2">
        <WorkflowStepper
          steps={b.workflow.steps}
          current={b.workflow.current}
          onStepClick={(i) => setTab((['overview', 'expenses', 'expenses', 'documents', 'overview', 'overview', 'overview'] as Tab[])[i])}
        />
      </Card>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'expenses', label: 'Expenses', count: expenses.length },
          { value: 'documents', label: 'Documents', count: docs.length },
          ...(perms.canViewAudit ? [{ value: 'history' as Tab, label: 'History' }] : []),
        ]}
      />

      {tab === 'overview' && (
        <div className="space-y-5">
          {b.warnings.length > 0 && (
            <Alert tone={b.warnings.some((w) => w.level === 'error') ? 'red' : 'amber'} title="Check before completing this shipment">
              <ul className="list-disc space-y-0.5 pl-5">
                {b.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
              </ul>
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Supplier invoice value', fmtMoney(b.analysis.productInvoiceValue)],
              ['Total expenses', fmtMoney(b.analysis.additionalExpenseTotal)],
              ['Expenses % of supplier invoice', fmtPct(b.analysis.additionalExpensePercentage)],
              ['Total landed cost', fmtMoney(b.analysis.totalLandedCost)],
            ].map(([l, v]) => (
              <Card key={l} className="p-4">
                <p className="text-xs text-slate-500">{l}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{v}</p>
              </Card>
            ))}
          </div>
          <CostAnalysisPanel analysis={b.analysis} showExclVat={b.settings.showLandedCostExclVat} />
          {canEdit && s.workflow_step < 6 && b.analysis.expenseCount > 0 && (
            <Alert tone="blue" title="Step 6 — Review cost distribution">
              <p>Check the table above against the invoices, then confirm the review.</p>
              <Button size="sm" className="mt-2" onClick={() => action.mutate('review')} loading={action.isPending}>Mark costs reviewed</Button>
            </Alert>
          )}
          <Card>
            <CardHeader title="Shipment information" actions={canEdit && <Button size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button>} />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Shipment reference', s.reference_no],
                  ['PO number', s.po_number],
                  ['Supplier', s.supplier?.name],
                  ['Supplier invoice', s.supplier_invoice_no ? `${s.supplier_invoice_no} · ${fmtDate(s.supplier_invoice_date)}` : null],
                  ['Country of origin', s.country_of_origin],
                  ['Shipping method', s.shipping_method ? SHIPPING_METHOD_LABEL[s.shipping_method] : null],
                  ['Freight forwarder', s.forwarder?.name],
                  ['AWB / BL', s.awb_bl_no],
                  ['Departure', fmtDate(s.departure_date)],
                  ['Expected arrival', fmtDate(s.expected_arrival_date)],
                  ['Actual arrival', fmtDate(s.actual_arrival_date)],
                  ['Customs clearance', fmtDate(s.customs_clearance_date)],
                  ['Warehouse receiving', fmtDate(s.warehouse_receiving_date)],
                  ['Invoice currency', `${s.currency_code} @ ${fmtRate(s.exchange_rate)}`],
                  ['Status', SHIPMENT_STATUS_LABEL[s.status]],
                  ['Completed', fmtDateTime(s.completed_at)],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <dt className="text-xs text-slate-500">{l}</dt>
                    <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
              {s.notes && <p className="mt-5 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-navy-800 dark:text-slate-300">{s.notes}</p>}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'expenses' && (
        <Card>
          <CardHeader
            title="Shipment expenses"
            subtitle="Every line converted at the rate stored on that line"
            actions={canEdit && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddingExpense(true)}>Add expense</Button>}
          />
          <ExpensesTable
            rows={expenses}
            showShipment={false}
            empty={<EmptyState title="No expenses yet" message="Start with the supplier invoice, then freight, insurance, customs duty, VAT and clearance." action={canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAddingExpense(true)}>Add expense</Button>} />}
          />
        </Card>
      )}

      {tab === 'documents' && (
        <div className="space-y-5">
          <DriveStatus />
          {canEdit && (
            <Card>
              <CardHeader title="Upload documents" subtitle="Supplier & freight invoices, customs declarations, SADAD receipts, AWB/BL, packing lists, certificates" />
              <CardBody><DocumentUploader shipment={s} expenses={expenses} /></CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Shipment documents" actions={<ZipButton shipment={s} docs={docs} />} />
            {b.documents.isLoading ? <Spinner /> : b.documents.isError ? <ErrorState error={b.documents.error} onRetry={() => b.documents.refetch()} /> : <DocumentsTable rows={docs} shipments={[s]} />}
          </Card>
        </div>
      )}

      {tab === 'history' && perms.canViewAudit && (
        <Card>
          <CardHeader title="Change history" subtitle="Audit log entries for this shipment record" />
          {history.isLoading ? (
            <Spinner />
          ) : history.isError ? (
            <ErrorState error={history.error} />
          ) : (history.data ?? []).length === 0 ? (
            <EmptyState title="No history" icon={<History className="h-6 w-6" />} />
          ) : (
            <ul className="divide-y divide-line dark:divide-navy-700">
              {history.data!.map((h) => {
                const changed = h.old_data && h.new_data ? Object.keys(h.new_data).filter((k) => k !== 'updated_at' && JSON.stringify(h.new_data![k]) !== JSON.stringify(h.old_data![k])) : [];
                return (
                  <li key={h.id} className="px-5 py-3 text-sm">
                    <span className="font-medium">{h.action}</span> <span className="text-slate-500">· {h.table_name} · {fmtDateTime(h.changed_at)}</span>
                    {h.summary && <p className="text-slate-600 dark:text-slate-300">{h.summary}</p>}
                    {changed.length > 0 && <p className="text-xs text-slate-500">Changed: {changed.join(', ')}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title={`Edit ${s.shipment_code}`} size="xl">
        <ShipmentForm shipment={s} onSaved={() => { setEditing(false); invalidate(); }} onCancel={() => setEditing(false)} />
      </Modal>
      <ExpenseFormModal open={addingExpense} onClose={() => setAddingExpense(false)} shipmentId={s.id} />
      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Change shipment status"
        size="sm"
        footer={<><Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button><Button onClick={() => action.mutate({ status: newStatus })} loading={action.isPending}>Update</Button></>}
      >
        <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ShipmentStatus)}>
          {SHIPMENT_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </Select>
        {newStatus === 'cancelled' && <p className="mt-2 text-xs text-amber-600">Cancelled shipments are excluded from financial summaries.</p>}
      </Modal>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && action.mutate(confirm)}
        loading={action.isPending}
        tone={confirm === 'archive' ? 'danger' : 'primary'}
        title={confirm === 'archive' ? 'Archive shipment?' : confirm === 'restore' ? 'Restore shipment?' : confirm === 'duplicate' ? 'Duplicate shipment?' : 'Mark shipment completed?'}
        confirmLabel={confirm === 'archive' ? 'Archive' : confirm === 'restore' ? 'Restore' : confirm === 'duplicate' ? 'Duplicate' : 'Mark completed'}
        message={
          confirm === 'archive'
            ? 'Archived shipments are hidden from the register and dashboard, but all records are kept and can be restored.'
            : confirm === 'restore'
              ? 'The shipment will appear in the register and dashboard again.'
              : confirm === 'duplicate'
                ? 'A new Draft shipment is created with the same supplier, forwarder, route and currency. Expenses and documents are not copied.'
                : b.warnings.length
                  ? `There are ${b.warnings.length} open warning(s) on this shipment. You can still complete it.`
                  : 'All checks passed. The completion date is recorded.'
        }
      />
    </div>
  );
}
