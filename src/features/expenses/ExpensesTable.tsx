import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, MoreHorizontal, Pencil, Trash2, XCircle, RotateCcw } from 'lucide-react';
import { ConfirmDialog, DataTable, Dropdown, PaymentStatusPill, ReviewStatusPill, DemoBadge, useToast, type Column } from '@/components/ui';
import { expensesService } from '@/services/expenses';
import { qk, useShipments } from '@/hooks/queries';
import { usePermissions } from '@/hooks/useAuth';
import { fmtAmount, fmtDate, fmtRate } from '@/lib/format';
import { sumMoney } from '@/lib/calculations';
import type { ExpenseWithRefs } from '@/types/database';
import { ExpenseFormModal } from './ExpenseFormModal';
import { PaymentsModal } from './PaymentsModal';

export function ExpensesTable({ rows, showShipment = true, empty, showFooter = true }: { rows: ExpenseWithRefs[]; showShipment?: boolean; empty?: ReactNode; showFooter?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const perms = usePermissions();
  const shipments = useShipments(true);
  const [editing, setEditing] = useState<ExpenseWithRefs | null>(null);
  const [paymentsId, setPaymentsId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ExpenseWithRefs | null>(null);

  const shipmentOf = (e: ExpenseWithRefs) => shipments.data?.find((s) => s.id === e.shipment_id);
  const canEdit = (e: ExpenseWithRefs) => perms.canEditShipment(shipmentOf(e));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.expenses });
  };
  const review = useMutation({
    mutationFn: ({ e, status }: { e: ExpenseWithRefs; status: 'approved' | 'rejected' | 'pending' }) => expensesService.review(e.id, status),
    onSuccess: (_, { status }) => {
      toast.success(status === 'approved' ? 'Expense approved' : status === 'rejected' ? 'Expense rejected' : 'Review reset');
      invalidate();
    },
    onError: (err) => toast.error('Review failed', err),
  });
  const del = useMutation({
    mutationFn: (e: ExpenseWithRefs) => expensesService.softDelete(e.id),
    onSuccess: () => {
      toast.success('Expense deleted', 'The record is kept in the audit log.');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => toast.error('Could not delete expense', err),
  });

  const columns: Column<ExpenseWithRefs>[] = [
    {
      key: 'no',
      header: 'Expense',
      sortValue: (e) => e.expense_no,
      cell: (e) => (
        <div className="min-w-[130px]">
          <p className="font-medium text-slate-900 dark:text-white">{e.expense_no} <DemoBadge show={e.is_demo} /></p>
          <p className="text-xs text-slate-500">{e.category?.name}</p>
        </div>
      ),
    },
    ...(showShipment
      ? [
          {
            key: 'shipment',
            header: 'Shipment',
            sortValue: (e: ExpenseWithRefs) => e.shipment?.shipment_code ?? '',
            cell: (e: ExpenseWithRefs) =>
              e.shipment ? (
                <Link to={`/shipments/${e.shipment_id}`} className="whitespace-nowrap text-accent hover:underline" onClick={(ev) => ev.stopPropagation()}>
                  {e.shipment.shipment_code}
                  <span className="block text-xs text-slate-500">{e.shipment.po_number}</span>
                </Link>
              ) : '—',
          } as Column<ExpenseWithRefs>,
        ]
      : []),
    {
      key: 'provider',
      header: 'Provider / invoice',
      sortValue: (e) => e.service_provider ?? '',
      cell: (e) => (
        <div className="max-w-[220px]">
          <p className="truncate">{e.service_provider ?? '—'}</p>
          <p className="truncate text-xs text-slate-500">{e.invoice_no ?? 'No invoice no.'} · {fmtDate(e.invoice_date)}</p>
        </div>
      ),
    },
    {
      key: 'orig',
      header: 'Original',
      align: 'right',
      hideBelow: 'md',
      sortValue: (e) => Number(e.original_amount),
      cell: (e) => (
        <div>
          <p>{e.currency_code} {fmtAmount(e.original_amount)}</p>
          {e.currency_code !== 'SAR' && <p className="text-xs text-slate-500">@ {fmtRate(e.exchange_rate)}</p>}
        </div>
      ),
    },
    {
      key: 'sar',
      header: 'Amount SAR',
      align: 'right',
      sortValue: (e) => Number(e.amount_sar),
      cell: (e) => <span className="font-semibold text-slate-900 dark:text-white">{fmtAmount(e.amount_sar)}</span>,
      footer: fmtAmount(sumMoney(rows.map((r) => Number(r.amount_sar)))),
    },
    {
      key: 'vat',
      header: 'VAT SAR',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (e) => Number(e.vat_amount_sar),
      cell: (e) => (Number(e.vat_amount_sar) ? fmtAmount(e.vat_amount_sar) : <span className="text-slate-400">—</span>),
      footer: fmtAmount(sumMoney(rows.map((r) => Number(r.vat_amount_sar)))),
    },
    {
      key: 'pay',
      header: 'Payment',
      sortValue: (e) => e.payment_status,
      cell: (e) => (
        <div className="space-y-1">
          <PaymentStatusPill status={e.payment_status} />
          {e.payment_date && <p className="text-[11px] text-slate-500">{fmtDate(e.payment_date)}</p>}
        </div>
      ),
    },
    { key: 'review', header: 'Review', hideBelow: 'lg', sortValue: (e) => e.review_status, cell: (e) => <ReviewStatusPill status={e.review_status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (e) => (
        <Dropdown
          trigger={
            <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-navy-800" aria-label="Expense actions">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
          items={[
            { label: 'Payments', icon: <CreditCard className="h-4 w-4" />, onClick: () => setPaymentsId(e.id) },
            { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(e), hidden: !canEdit(e) },
            { label: 'Approve', icon: <CheckCircle2 className="h-4 w-4" />, onClick: () => review.mutate({ e, status: 'approved' }), hidden: !perms.canReview || e.review_status === 'approved' },
            { label: 'Reject', icon: <XCircle className="h-4 w-4" />, onClick: () => review.mutate({ e, status: 'rejected' }), hidden: !perms.canReview || e.review_status === 'rejected' },
            { label: 'Reset review', icon: <RotateCcw className="h-4 w-4" />, onClick: () => review.mutate({ e, status: 'pending' }), hidden: !perms.canReview || e.review_status === 'pending' },
            { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleting(e), danger: true, hidden: !canEdit(e) },
          ]}
        />
      ),
    },
  ];

  const paymentsExpense = paymentsId ? rows.find((r) => r.id === paymentsId) ?? null : null;
  return (
    <>
      <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} empty={empty} showFooter={showFooter && rows.length > 0} initialSort={{ key: 'no', dir: 'desc' }} />
      <ExpenseFormModal open={!!editing} onClose={() => setEditing(null)} expense={editing} />
      <PaymentsModal expense={paymentsExpense} onClose={() => setPaymentsId(null)} canEdit={paymentsExpense ? canEdit(paymentsExpense) : false} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting)}
        loading={del.isPending}
        title="Delete expense?"
        message={
          <>
            <p>
              {deleting?.expense_no} — {deleting?.category?.name}, SAR {fmtAmount(deleting?.amount_sar)}. It will be removed from all totals and the landed cost,
              but kept in the audit log.
            </p>
            {deleting && Number(deleting.paid_amount) > 0 && <p className="mt-2 font-medium text-red-600">This expense has recorded payments.</p>}
          </>
        }
        confirmLabel="Delete expense"
      />
    </>
  );
}
