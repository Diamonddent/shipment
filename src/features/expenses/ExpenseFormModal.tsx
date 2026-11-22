import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { Alert, Button, Checkbox, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { CurrencyRateFields } from '@/features/shared/CurrencyRateFields';
import { qk, useCategories, useForwarders, useShipments, useSuppliers } from '@/hooks/queries';
import { useAuth } from '@/hooks/useAuth';
import { expensesService, type ExpenseInput } from '@/services/expenses';
import { documentsService } from '@/services/documents';
import { googleDrive } from '@/services/googleDrive';
import { ALLOWED_UPLOAD_EXT, DOC_TYPES, PAYMENT_METHODS } from '@/lib/constants';
import { expensePayable, toSar } from '@/lib/calculations';
import { fmtMoney } from '@/lib/format';
import { cleanPayload, todayISO } from '@/lib/utils';
import { errorMessage, isDuplicateExpenseError } from '@/lib/errors';
import type { DocType, ExpenseWithRefs, PaymentMethod } from '@/types/database';

const schema = z
  .object({
    shipment_id: z.string().min(1, 'Select a shipment'),
    category_id: z.string().min(1, 'Select a category'),
    description: z.string().optional(),
    service_provider: z.string().trim().min(1, 'Enter the supplier / service provider'),
    invoice_no: z.string().optional(),
    invoice_date: z.string().optional(),
    currency_code: z.string().min(3),
    original_amount: z.number({ invalid_type_error: 'Enter the amount' }).min(0, 'Cannot be negative'),
    exchange_rate: z.number({ invalid_type_error: 'Enter the exchange rate' }).positive('Must be greater than 0'),
    vat_amount: z.number({ invalid_type_error: 'Enter 0 if none' }).min(0),
    payment_method: z.string().optional(),
    notes: z.string().optional(),
    initial_payment: z.enum(['unpaid', 'paid', 'partial']),
    partial_amount: z.number().optional(),
    payment_date: z.string().optional(),
  })
  .refine((v) => v.currency_code === 'SAR' || v.exchange_rate !== 1, { message: 'Enter the real exchange rate', path: ['exchange_rate'] })
  .refine((v) => v.initial_payment !== 'partial' || ((v.partial_amount ?? 0) > 0 && (v.partial_amount ?? 0) < expensePayable(v.original_amount, v.vat_amount)), {
    message: 'Partial amount must be more than 0 and less than the total',
    path: ['partial_amount'],
  });
type Form = z.infer<typeof schema>;

export function defaultDocType(code?: string | null): DocType {
  switch (code) {
    case 'PRODUCT_INVOICE': return 'supplier_invoice';
    case 'FREIGHT': return 'freight_invoice';
    case 'CUSTOMS_DUTY':
    case 'IMPORT_VAT': return 'sadad_receipt';
    case 'CLEARANCE':
    case 'SABER':
    case 'SFDA': return 'clearance_invoice';
    default: return 'other';
  }
}

export function ExpenseFormModal({
  open,
  onClose,
  expense,
  shipmentId,
  presetCategoryCode,
  presetValues,
}: {
  open: boolean;
  onClose: () => void;
  expense?: ExpenseWithRefs | null;
  shipmentId?: string;
  presetCategoryCode?: string;
  presetValues?: Partial<Form>;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useAuth();
  const categories = useCategories();
  const shipments = useShipments();
  const suppliers = useSuppliers();
  const forwarders = useForwarders();
  const [dupes, setDupes] = useState<ExpenseWithRefs[] | null>(null);
  const [override, setOverride] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>('other');
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  const { register, watch, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (!open) return;
    setDupes(null);
    setOverride(expense?.duplicate_override ?? false);
    setFile(null);
    const presetCat = categories.data?.find((c) => c.code === presetCategoryCode);
    form.reset({
      shipment_id: expense?.shipment_id ?? shipmentId ?? '',
      category_id: expense?.category_id ?? presetCat?.id ?? '',
      description: expense?.description ?? '',
      service_provider: expense?.service_provider ?? '',
      invoice_no: expense?.invoice_no ?? '',
      invoice_date: expense?.invoice_date ?? todayISO(),
      currency_code: expense?.currency_code ?? 'SAR',
      original_amount: expense ? Number(expense.original_amount) : (undefined as unknown as number),
      exchange_rate: expense ? Number(expense.exchange_rate) : 1,
      vat_amount: expense ? Number(expense.vat_amount) : 0,
      payment_method: expense?.payment_method ?? '',
      notes: expense?.notes ?? '',
      initial_payment: 'unpaid',
      partial_amount: undefined,
      payment_date: todayISO(),
      ...Object.fromEntries(Object.entries(presetValues ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    });
    setDocType(defaultDocType(expense?.category?.code ?? presetCat?.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense, shipmentId, presetCategoryCode, categories.data]);

  const categoryId = watch('category_id');
  const category = categories.data?.find((c) => c.id === categoryId);
  useEffect(() => {
    if (category && !expense) setDocType(defaultDocType(category.code));
  }, [category, expense]);

  const amount = Number(watch('original_amount')) || 0;
  const rate = Number(watch('exchange_rate')) || 0;
  const vat = Number(watch('vat_amount')) || 0;
  const currency = watch('currency_code');
  const initialPayment = watch('initial_payment');
  const amountSar = toSar(amount, rate);
  const vatSar = toSar(vat, rate);

  const providers = useMemo(
    () => [...(suppliers.data ?? []).map((s) => s.name), ...(forwarders.data ?? []).map((f) => f.name)],
    [suppliers.data, forwarders.data],
  );

  const shipmentOptions = (shipments.data ?? []).filter((s) => s.status !== 'cancelled' || s.id === (expense?.shipment_id ?? shipmentId));

  const save = useMutation({
    mutationFn: async ({ v, forceOverride }: { v: Form; forceOverride: boolean }) => {
      if (!forceOverride && !override) {
        const found = await expensesService.findDuplicates({
          service_provider: v.service_provider,
          invoice_no: v.invoice_no ?? null,
          category_id: v.category_id,
          original_amount: v.original_amount,
          currency_code: v.currency_code,
          excludeId: expense?.id,
        });
        if (found.length) {
          setDupes(found);
          return null;
        }
      }
      const prov = v.service_provider.trim().toLowerCase();
      const payload: ExpenseInput = cleanPayload({
        shipment_id: v.shipment_id,
        category_id: v.category_id,
        description: v.description,
        service_provider: v.service_provider.trim(),
        supplier_id: suppliers.data?.find((s) => s.name.toLowerCase() === prov)?.id ?? null,
        forwarder_id: forwarders.data?.find((f) => f.name.toLowerCase() === prov)?.id ?? null,
        invoice_no: v.invoice_no,
        invoice_date: v.invoice_date,
        currency_code: v.currency_code,
        original_amount: v.original_amount,
        exchange_rate: v.currency_code === 'SAR' ? 1 : v.exchange_rate,
        vat_amount: v.vat_amount || 0,
        payment_method: (v.payment_method || null) as PaymentMethod | null,
        notes: v.notes,
        duplicate_override: forceOverride || override,
      });
      const saved = expense ? await expensesService.update(expense.id, payload) : await expensesService.create(payload);
      if (!expense && v.initial_payment !== 'unpaid') {
        const amt = v.initial_payment === 'paid' ? expensePayable(v.original_amount, v.vat_amount) : Number(v.partial_amount);
        if (amt > 0)
          await expensesService.addPayment({
            expense_id: saved.id,
            amount: amt,
            payment_date: v.payment_date || todayISO(),
            payment_method: (v.payment_method || null) as PaymentMethod | null,
            reference: null,
            notes: 'Recorded with the expense',
          });
      }
      let uploadError: string | null = null;
      if (file) {
        const shp = shipments.data?.find((s) => s.id === v.shipment_id) ?? saved.shipment;
        if (shp && session) {
          try {
            await documentsService.upload({ shipment: shp, file, docType, expenseId: saved.id, userId: session.user.id });
          } catch (err) {
            uploadError = errorMessage(err);
          }
        }
      }
      return { saved, uploadError };
    },
    onSuccess: (res) => {
      if (!res) return;
      qc.invalidateQueries({ queryKey: qk.expenses });
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['shipment'] });
      toast.success(expense ? 'Expense updated' : `Expense ${res.saved.expense_no} added`, `${fmtMoney(res.saved.amount_sar)}`);
      if (res.uploadError) toast.error('Expense saved, but the attachment was not uploaded', res.uploadError);
      onClose();
    },
    onError: (err) => {
      if (isDuplicateExpenseError(err)) {
        setDupes([]);
        return;
      }
      toast.error('Could not save expense', err);
    },
  });

  const submit = (forceOverride = false) => form.handleSubmit((v) => save.mutate({ v, forceOverride }))();

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={expense ? `Edit expense ${expense.expense_no}` : 'Add expense'}
      subtitle="Amount in SAR = Original Amount × Exchange Rate (stored with the record)"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit(false)} loading={save.isPending}>{expense ? 'Save changes' : 'Add expense'}</Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={(ev) => { ev.preventDefault(); submit(false); }} noValidate>
        {dupes && (
          <Alert tone="amber" title="Possible duplicate expense">
            <p>
              An expense with the same provider, invoice number, category and amount already exists
              {dupes.length > 0 && <>: {dupes.map((d) => `${d.expense_no} (${d.shipment?.shipment_code ?? ''})`).join(', ')}</>}.
              If this is a legitimate separate line of the same invoice, you can save it anyway.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setDupes(null)}>Review entry</Button>
              <Button size="sm" onClick={() => { setOverride(true); setDupes(null); submit(true); }}>Save anyway</Button>
            </div>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Shipment" required error={e.shipment_id?.message}>
            <Select {...register('shipment_id')} disabled={!!shipmentId || !!expense} invalid={!!e.shipment_id}>
              <option value="">Select shipment…</option>
              {shipmentOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.shipment_code} · {s.po_number ?? '—'} · {s.supplier?.name ?? ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Expense category" required error={e.category_id?.message}>
            <Select {...register('category_id')} invalid={!!e.category_id}>
              <option value="">Select category…</option>
              {(categories.data ?? []).filter((c) => c.is_active || c.id === categoryId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier / service provider" required error={e.service_provider?.message}>
            <Input list="dd-providers" {...register('service_provider')} invalid={!!e.service_provider} />
          </Field>
          <Field label="Description" className="sm:col-span-2 lg:col-span-3"><Input {...register('description')} /></Field>
          <Field label="Invoice number" hint="Used for duplicate detection"><Input {...register('invoice_no')} /></Field>
          <Field label="Invoice date"><Input type="date" {...register('invoice_date')} /></Field>
          <Field label="Payment method">
            <Select {...register('payment_method')}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <CurrencyRateFields form={form} currencyName="currency_code" rateName="exchange_rate" />
          <Field label={`Original amount (${currency || '—'})`} required error={e.original_amount?.message}>
            <Input type="number" step="0.01" min="0" {...register('original_amount', { valueAsNumber: true })} invalid={!!e.original_amount} />
          </Field>
          <Field label={`VAT amount (${currency || '—'}), if applicable`} error={e.vat_amount?.message} hint="VAT on a service invoice — reported separately, not added to landed cost by default">
            <Input type="number" step="0.01" min="0" {...register('vat_amount', { valueAsNumber: true })} />
          </Field>
          <div className="rounded-lg border border-accent-100 bg-accent-50/60 px-4 py-3 dark:border-navy-700 dark:bg-navy-800 sm:col-span-2 lg:col-span-1">
            <p className="text-xs text-slate-500">Amount in SAR</p>
            <p className="text-lg font-semibold tabular-nums text-primary dark:text-white">{fmtMoney(amountSar)}</p>
            {vat > 0 && <p className="text-xs text-slate-500">+ VAT {fmtMoney(vatSar)} · payable {fmtMoney(toSar(expensePayable(amount, vat), rate))}</p>}
            {category?.is_recoverable_vat && <p className="mt-1 text-[11px] text-slate-500">Import VAT — included in landed cost, shown separately as recoverable.</p>}
          </div>
        </div>

        {!expense ? (
          <div className="grid gap-4 rounded-lg border border-line p-4 dark:border-navy-700 sm:grid-cols-3">
            <Field label="Payment status">
              <Select {...register('initial_payment')}>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partially paid</option>
                <option value="paid">Paid in full</option>
              </Select>
            </Field>
            {initialPayment === 'partial' && (
              <Field label={`Amount paid (${currency})`} error={e.partial_amount?.message}>
                <Input type="number" step="0.01" min="0" {...register('partial_amount', { valueAsNumber: true })} />
              </Field>
            )}
            {initialPayment !== 'unpaid' && (
              <Field label="Payment date"><Input type="date" {...register('payment_date')} /></Field>
            )}
            <p className="text-xs text-slate-500 sm:col-span-3">A payment record is created automatically; later payments are added from the expense’s Payments panel.</p>
          </div>
        ) : (
          <Alert tone="blue">Payment status is calculated from recorded payments. Use “Payments” on the expense to add partial or full payments.</Alert>
        )}

        <Field label="Expense notes"><Textarea rows={2} {...register('notes')} /></Field>

        <div className="rounded-lg border border-dashed border-line p-4 dark:border-navy-700">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Attachment (PDF, JPG, PNG) — saved to Google Drive" className="min-w-[220px] flex-1">
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(ev) => {
                  const f = ev.target.files?.[0] ?? null;
                  if (f && !ALLOWED_UPLOAD_EXT.includes((f.name.split('.').pop() ?? '').toLowerCase())) {
                    toast.error('Only PDF, JPG and PNG files are allowed');
                    ev.target.value = '';
                    return;
                  }
                  setFile(f);
                }}
                className="py-1.5"
                disabled={!googleDrive.isConfigured()}
              />
            </Field>
            <Field label="Document type" className="w-56">
              <Select value={docType} onChange={(ev) => setDocType(ev.target.value as DocType)}>
                {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Select>
            </Field>
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
            <Paperclip className="h-3.5 w-3.5" />
            {googleDrive.isConfigured()
              ? 'You may be asked to allow Google Drive access. Only file metadata is stored in the database.'
              : 'Google Drive is not configured (VITE_GOOGLE_CLIENT_ID), so attachments are disabled.'}
          </p>
        </div>
        {expense && (
          <Checkbox
            label="Allow as a separate line even if it matches another expense"
            checked={override}
            onChange={(ev) => setOverride(ev.target.checked)}
          />
        )}
        <datalist id="dd-providers">{providers.map((p) => <option key={p} value={p} />)}</datalist>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
