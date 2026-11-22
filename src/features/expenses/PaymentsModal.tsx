import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Field, Input, Modal, PaymentStatusPill, Select, Spinner, ErrorState, useToast } from '@/components/ui';
import { expensesService } from '@/services/expenses';
import { qk } from '@/hooks/queries';
import { usePermissions } from '@/hooks/useAuth';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@/lib/constants';
import { expensePayable, sumMoney, toSar } from '@/lib/calculations';
import { fmtAmount, fmtDate, fmtMoney } from '@/lib/format';
import { todayISO } from '@/lib/utils';
import type { ExpensePayment, ExpenseWithRefs, PaymentMethod } from '@/types/database';

export function PaymentsModal({ expense, onClose, canEdit }: { expense: ExpenseWithRefs | null; onClose: () => void; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { canDeletePayments } = usePermissions();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [reference, setReference] = useState('');
  const [toDelete, setToDelete] = useState<ExpensePayment | null>(null);
  const payments = useQuery({ queryKey: ['payments', expense?.id], queryFn: () => expensesService.payments(expense!.id), enabled: !!expense });

  const payable = expense ? expensePayable(Number(expense.original_amount), Number(expense.vat_amount)) : 0;
  const paid = sumMoney((payments.data ?? []).map((p) => Number(p.amount)));
  const remaining = sumMoney([payable, -paid]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payments', expense?.id] });
    qc.invalidateQueries({ queryKey: qk.expenses });
  };
  const add = useMutation({
    mutationFn: () =>
      expensesService.addPayment({ expense_id: expense!.id, amount: Number(amount), payment_date: date, payment_method: method || null, reference: reference || null, notes: null }),
    onSuccess: () => {
      toast.success('Payment recorded');
      setAmount('');
      setReference('');
      refresh();
    },
    onError: (e) => toast.error('Could not record payment', e),
  });
  const del = useMutation({
    mutationFn: (p: ExpensePayment) => expensesService.deletePayment(p.id),
    onSuccess: () => {
      toast.success('Payment deleted');
      setToDelete(null);
      refresh();
    },
    onError: (e) => toast.error('Could not delete payment', e),
  });

  const amt = Number(amount);
  const invalid = !amount || !(amt > 0) || amt > remaining + 0.001;

  return (
    <Modal open={!!expense} onClose={onClose} title={`Payments — ${expense?.expense_no ?? ''}`} subtitle={expense ? `${expense.category?.name} · ${expense.service_provider ?? ''} · invoice ${expense.invoice_no ?? '—'}` : ''}>
      {expense && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Total payable', `${expense.currency_code} ${fmtAmount(payable)}`],
              ['Paid', `${expense.currency_code} ${fmtAmount(paid)}`],
              ['Outstanding', `${expense.currency_code} ${fmtAmount(remaining)}`],
              ['Outstanding SAR', fmtMoney(toSar(remaining, Number(expense.exchange_rate)))],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-navy-800">
                <p className="text-[11px] text-slate-500">{l}</p>
                <p className="text-sm font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">Status: <PaymentStatusPill status={expense.payment_status} /></div>
          {payments.isLoading ? (
            <Spinner />
          ) : payments.isError ? (
            <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
          ) : (payments.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-line py-6 text-center text-sm text-slate-500 dark:border-navy-700">No payments recorded yet.</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-[11px] uppercase text-slate-500">
                <tr><th className="py-2">Date</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th className="text-right">SAR</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-navy-700">
                {payments.data!.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2">{fmtDate(p.payment_date)}</td>
                    <td>{p.payment_method ? PAYMENT_METHOD_LABEL[p.payment_method] : '—'}</td>
                    <td>{p.reference ?? '—'}</td>
                    <td className="text-right">{fmtAmount(p.amount)}</td>
                    <td className="text-right">{fmtAmount(p.amount_sar)}</td>
                    <td className="text-right">
                      {canDeletePayments && (
                        <button onClick={() => setToDelete(p)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete payment">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEdit && remaining > 0 && (
            <form
              className="grid gap-3 rounded-lg border border-line p-4 dark:border-navy-700 sm:grid-cols-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!invalid) add.mutate();
              }}
            >
              <Field label={`Amount (${expense.currency_code})`} error={amount && amt > remaining + 0.001 ? 'More than outstanding' : undefined}>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Method">
                <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  <option value="">—</option>
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </Field>
              <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SADAD / TT ref" /></Field>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={invalid} loading={add.isPending} className="flex-1">Add</Button>
                <Button variant="outline" onClick={() => setAmount(String(remaining))} title="Pay the full outstanding amount">Full</Button>
              </div>
            </form>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete)}
        loading={del.isPending}
        title="Delete payment?"
        message={`This removes the payment of ${toDelete ? fmtAmount(toDelete.amount) : ''} and recalculates the payment status. The deletion is recorded in the audit log.`}
        confirmLabel="Delete payment"
      />
    </Modal>
  );
}
