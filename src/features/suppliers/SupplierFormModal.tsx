import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { suppliersService } from '@/services/masterData';
import { qk, useCurrencies } from '@/hooks/queries';
import { COUNTRIES } from '@/lib/constants';
import { cleanPayload, invalidFormHandler } from '@/lib/utils';
import type { Supplier } from '@/types/database';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  country: z.string().optional(),
  city: z.string().optional(),
  contact_person: z.string().optional(),
  email: z.union([z.literal(''), z.string().trim().email('Invalid e-mail')]).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  vat_number: z.string().optional(),
  payment_terms: z.string().optional(),
  default_currency: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean(),
});
type Form = z.infer<typeof schema>;

export function SupplierFormModal({ open, onClose, supplier, onSaved }: { open: boolean; onClose: () => void; supplier?: Supplier | null; onSaved?: (s: Supplier) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const currencies = useCurrencies();
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open)
      form.reset({
        name: supplier?.name ?? '',
        country: supplier?.country ?? '',
        city: supplier?.city ?? '',
        contact_person: supplier?.contact_person ?? '',
        email: supplier?.email ?? '',
        phone: supplier?.phone ?? '',
        address: supplier?.address ?? '',
        vat_number: supplier?.vat_number ?? '',
        payment_terms: supplier?.payment_terms ?? '',
        default_currency: supplier?.default_currency ?? '',
        notes: supplier?.notes ?? '',
        is_active: supplier?.is_active ?? true,
      });
  }, [open, supplier, form]);

  const save = useMutation({
    mutationFn: (v: Form) => {
      const payload = cleanPayload(v);
      return supplier ? suppliersService.update(supplier.id, payload) : suppliersService.create(payload);
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: qk.suppliers });
      qc.invalidateQueries({ queryKey: qk.shipments });
      toast.success(supplier ? 'Supplier updated' : 'Supplier created', s.name);
      onSaved?.(s);
      onClose();
    },
    onError: (e) => toast.error('Could not save supplier', e),
  });
  const e = form.formState.errors;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplier ? 'Edit supplier' : 'New supplier'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={form.handleSubmit((v) => save.mutate(v), invalidFormHandler(toast))} loading={save.isPending}>Save supplier</Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v), invalidFormHandler(toast))}>
        <Field label="Supplier name" required error={e.name?.message} className="sm:col-span-2"><Input {...form.register('name')} invalid={!!e.name} /></Field>
        <Field label="Country">
          <Input list="dd-countries" {...form.register('country')} />
        </Field>
        <Field label="City"><Input {...form.register('city')} /></Field>
        <Field label="Contact person"><Input {...form.register('contact_person')} /></Field>
        <Field label="E-mail" error={e.email?.message}><Input type="email" {...form.register('email')} /></Field>
        <Field label="Phone"><Input {...form.register('phone')} /></Field>
        <Field label="Default currency">
          <Select {...form.register('default_currency')}>
            <option value="">—</option>
            {(currencies.data ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </Select>
        </Field>
        <Field label="VAT / Tax number"><Input {...form.register('vat_number')} /></Field>
        <Field label="Payment terms"><Input placeholder="e.g. Net 60" {...form.register('payment_terms')} /></Field>
        <Field label="Address" className="sm:col-span-2"><Textarea rows={2} {...form.register('address')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...form.register('notes')} /></Field>
        <Checkbox label="Active" {...form.register('is_active')} />
        <datalist id="dd-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
