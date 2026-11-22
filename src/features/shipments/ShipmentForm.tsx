import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button, Field, Input, Select, Textarea, useToast } from '@/components/ui';
import { CurrencyRateFields } from '@/features/shared/CurrencyRateFields';
import { SupplierFormModal } from '@/features/suppliers/SupplierFormModal';
import { ForwarderFormModal } from '@/features/forwarders/ForwarderFormModal';
import { qk, useForwarders, useSuppliers, useUsers } from '@/hooks/queries';
import { usePermissions } from '@/hooks/useAuth';
import { shipmentsService, type ShipmentInput } from '@/services/shipments';
import { COUNTRIES, SHIPMENT_STATUSES, SHIPPING_METHODS } from '@/lib/constants';
import { cleanPayload } from '@/lib/utils';
import type { ShipmentWithRefs } from '@/types/database';

const optDate = z.string().optional();
const schema = z
  .object({
    reference_no: z.string().optional(),
    po_number: z.string().trim().min(1, 'PO number is required'),
    supplier_id: z.string().min(1, 'Select a supplier'),
    supplier_invoice_no: z.string().optional(),
    supplier_invoice_date: optDate,
    country_of_origin: z.string().optional(),
    shipping_method: z.string().optional(),
    forwarder_id: z.string().optional(),
    awb_bl_no: z.string().optional(),
    departure_date: optDate,
    expected_arrival_date: optDate,
    actual_arrival_date: optDate,
    customs_clearance_date: optDate,
    warehouse_receiving_date: optDate,
    currency_code: z.string().min(3),
    exchange_rate: z.number({ invalid_type_error: 'Enter the exchange rate' }).positive('Must be greater than 0'),
    status: z.string(),
    assigned_to: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((v) => !v.departure_date || !v.actual_arrival_date || v.actual_arrival_date >= v.departure_date, {
    message: 'Arrival cannot be before departure',
    path: ['actual_arrival_date'],
  })
  .refine((v) => v.currency_code === 'SAR' || v.exchange_rate !== 1, {
    message: 'Enter the real exchange rate for this currency',
    path: ['exchange_rate'],
  });
export type ShipmentFormValues = z.infer<typeof schema>;

export function shipmentDefaults(s?: ShipmentWithRefs | null): ShipmentFormValues {
  return {
    reference_no: s?.reference_no ?? '',
    po_number: s?.po_number ?? '',
    supplier_id: s?.supplier_id ?? '',
    supplier_invoice_no: s?.supplier_invoice_no ?? '',
    supplier_invoice_date: s?.supplier_invoice_date ?? '',
    country_of_origin: s?.country_of_origin ?? '',
    shipping_method: s?.shipping_method ?? '',
    forwarder_id: s?.forwarder_id ?? '',
    awb_bl_no: s?.awb_bl_no ?? '',
    departure_date: s?.departure_date ?? '',
    expected_arrival_date: s?.expected_arrival_date ?? '',
    actual_arrival_date: s?.actual_arrival_date ?? '',
    customs_clearance_date: s?.customs_clearance_date ?? '',
    warehouse_receiving_date: s?.warehouse_receiving_date ?? '',
    currency_code: s?.currency_code ?? 'USD',
    exchange_rate: s ? Number(s.exchange_rate) : 3.75,
    status: s?.status ?? 'draft',
    assigned_to: s?.assigned_to ?? '',
    notes: s?.notes ?? '',
  };
}

export function ShipmentForm({
  shipment,
  onSaved,
  onCancel,
  submitLabel,
  sections = 'all',
}: {
  shipment?: ShipmentWithRefs | null;
  onSaved: (s: ShipmentWithRefs) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** 'basic' hides logistics dates (used by the wizard's first step) */
  sections?: 'all' | 'basic';
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { isManager } = usePermissions();
  const suppliers = useSuppliers();
  const forwarders = useForwarders();
  const users = useUsers();
  const [supOpen, setSupOpen] = useState(false);
  const [ffOpen, setFfOpen] = useState(false);
  const form = useForm<ShipmentFormValues>({ resolver: zodResolver(schema), defaultValues: shipmentDefaults(shipment) });
  const { register, formState, watch, setValue } = form;
  const e = formState.errors;

  useEffect(() => {
    form.reset(shipmentDefaults(shipment));
  }, [shipment, form]);

  // supplier picked -> suggest country & currency
  const supplierId = watch('supplier_id');
  useEffect(() => {
    const sup = suppliers.data?.find((x) => x.id === supplierId);
    if (!sup || !formState.dirtyFields.supplier_id) return;
    if (sup.country && !form.getValues('country_of_origin')) setValue('country_of_origin', sup.country);
    if (sup.default_currency && !shipment) setValue('currency_code', sup.default_currency, { shouldDirty: true });
  }, [supplierId, suppliers.data, formState.dirtyFields.supplier_id, form, setValue, shipment]);

  const save = useMutation({
    mutationFn: (v: ShipmentFormValues) => {
      const payload = cleanPayload(v) as ShipmentInput;
      return shipment ? shipmentsService.update(shipment.id, payload) : shipmentsService.create(payload);
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: qk.shipments });
      qc.invalidateQueries({ queryKey: qk.shipmentsAll });
      qc.setQueryData(qk.shipment(s.id), s);
      toast.success(shipment ? 'Shipment updated' : `Shipment ${s.shipment_code} created`);
      onSaved(s);
    },
    onError: (err) => toast.error('Could not save shipment', err),
  });

  const activeSuppliers = (suppliers.data ?? []).filter((s) => s.is_active || s.id === supplierId);
  const activeForwarders = (forwarders.data ?? []).filter((f) => f.is_active || f.id === watch('forwarder_id'));

  return (
    <>
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-6">
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Shipment & supplier</h4>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Shipment ID" hint="Generated automatically on save">
            <Input value={shipment?.shipment_code ?? 'SHP-YYYY-NNNN (auto)'} disabled />
          </Field>
          <Field label="PO number" required error={e.po_number?.message}>
            <Input placeholder="PO-4501" {...register('po_number')} invalid={!!e.po_number} />
          </Field>
          <Field label="Shipment reference no.">
            <Input {...register('reference_no')} />
          </Field>
          <Field label="Supplier" required error={e.supplier_id?.message}>
            <div className="flex gap-2">
              <Select {...register('supplier_id')} invalid={!!e.supplier_id}>
                <option value="">Select supplier…</option>
                {activeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <Button variant="outline" size="icon" onClick={() => setSupOpen(true)} title="New supplier" aria-label="New supplier">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <Field label="Supplier invoice no.">
            <Input {...register('supplier_invoice_no')} />
          </Field>
          <Field label="Supplier invoice date">
            <Input type="date" {...register('supplier_invoice_date')} />
          </Field>
          <Field label="Country of origin">
            <Input list="dd-countries-shp" {...register('country_of_origin')} />
          </Field>
          <CurrencyRateFields form={form} currencyName="currency_code" rateName="exchange_rate" />
        </div>
      </section>

      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Logistics</h4>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Shipping method">
            <Select {...register('shipping_method')}>
              <option value="">—</option>
              {SHIPPING_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Freight forwarder">
            <div className="flex gap-2">
              <Select {...register('forwarder_id')}>
                <option value="">—</option>
                {activeForwarders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
              <Button variant="outline" size="icon" onClick={() => setFfOpen(true)} title="New forwarder" aria-label="New forwarder">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <Field label="AWB / BL number">
            <Input {...register('awb_bl_no')} />
          </Field>
          <Field label="Departure date"><Input type="date" {...register('departure_date')} /></Field>
          <Field label="Expected arrival"><Input type="date" {...register('expected_arrival_date')} /></Field>
          {sections === 'all' && (
            <>
              <Field label="Actual arrival" error={e.actual_arrival_date?.message}><Input type="date" {...register('actual_arrival_date')} /></Field>
              <Field label="Customs clearance date"><Input type="date" {...register('customs_clearance_date')} /></Field>
              <Field label="Warehouse receiving date"><Input type="date" {...register('warehouse_receiving_date')} /></Field>
            </>
          )}
          <Field label="Status">
            <Select {...register('status')}>
              {SHIPMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          {isManager && (
            <Field label="Assigned to" hint="Employees can edit shipments assigned to them">
              <Select {...register('assigned_to')}>
                <option value="">—</option>
                {(users.data ?? []).filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </section>

      <Field label="Notes">
        <Textarea rows={3} {...register('notes')} />
      </Field>
      <datalist id="dd-countries-shp">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4 dark:border-navy-700">
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={save.isPending}>{submitLabel ?? (shipment ? 'Save changes' : 'Create shipment')}</Button>
      </div>
    </form>
      <SupplierFormModal open={supOpen} onClose={() => setSupOpen(false)} onSaved={(s) => setValue('supplier_id', s.id, { shouldDirty: true, shouldValidate: true })} />
      <ForwarderFormModal open={ffOpen} onClose={() => setFfOpen(false)} onSaved={(f) => setValue('forwarder_id', f.id, { shouldDirty: true })} />
    </>
  );
}
