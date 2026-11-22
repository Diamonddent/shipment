import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Field, Input, Modal, Select, useToast } from '@/components/ui';
import { productsService } from '@/services/masterData';
import { qk, useCurrencies } from '@/hooks/queries';
import { cleanPayload } from '@/lib/utils';
import type { Product } from '@/types/database';

const optNum = z.preprocess((v) => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v), z.number().min(0).optional());
const schema = z.object({
  item_code: z.string().trim().min(1, 'Item code is required'),
  description: z.string().trim().min(1, 'Description is required'),
  manufacturer: z.string().optional(),
  brand: z.string().optional(),
  hs_code: z.string().optional(),
  country_of_origin: z.string().optional(),
  unit_of_measure: z.string().min(1),
  default_unit_price: optNum,
  default_currency: z.string().optional(),
  unit_net_weight: optNum,
  unit_gross_weight: optNum,
  sfda_registration: z.string().optional(),
  is_active: z.boolean(),
});
type Form = z.infer<typeof schema>;

export function ProductFormModal({ open, onClose, product }: { open: boolean; onClose: () => void; product?: Product | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const currencies = useCurrencies();
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open)
      form.reset({
        item_code: product?.item_code ?? '',
        description: product?.description ?? '',
        manufacturer: product?.manufacturer ?? '',
        brand: product?.brand ?? '',
        hs_code: product?.hs_code ?? '',
        country_of_origin: product?.country_of_origin ?? '',
        unit_of_measure: product?.unit_of_measure ?? 'PCS',
        default_unit_price: product?.default_unit_price ?? undefined,
        default_currency: product?.default_currency ?? '',
        unit_net_weight: product?.unit_net_weight ?? undefined,
        unit_gross_weight: product?.unit_gross_weight ?? undefined,
        sfda_registration: product?.sfda_registration ?? '',
        is_active: product?.is_active ?? true,
      });
  }, [open, product, form]);
  const save = useMutation({
    mutationFn: (v: Form) => (product ? productsService.update(product.id, cleanPayload(v)) : productsService.create(cleanPayload(v))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.products }); toast.success(product ? 'Product updated' : 'Product created'); onClose(); },
    onError: (e) => toast.error('Could not save product', e),
  });
  const e = form.formState.errors;
  const r = form.register;
  return (
    <Modal open={open} onClose={onClose} size="lg" title={product ? 'Edit product' : 'New product'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={form.handleSubmit((v) => save.mutate(v))} loading={save.isPending}>Save</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="Item code" required error={e.item_code?.message}><Input {...r('item_code')} invalid={!!e.item_code} /></Field>
        <Field label="Description" required error={e.description?.message} className="sm:col-span-1 lg:col-span-2"><Input {...r('description')} invalid={!!e.description} /></Field>
        <Field label="Manufacturer"><Input {...r('manufacturer')} /></Field>
        <Field label="Brand"><Input {...r('brand')} /></Field>
        <Field label="HS code"><Input {...r('hs_code')} /></Field>
        <Field label="Country of origin"><Input {...r('country_of_origin')} /></Field>
        <Field label="Unit of measure"><Input {...r('unit_of_measure')} /></Field>
        <Field label="SFDA registration no."><Input {...r('sfda_registration')} /></Field>
        <Field label="Default unit price"><Input type="number" step="0.0001" {...r('default_unit_price', { valueAsNumber: true })} /></Field>
        <Field label="Price currency">
          <Select {...r('default_currency')}><option value="">—</option>{(currencies.data ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</Select>
        </Field>
        <div />
        <Field label="Net weight per unit (kg)"><Input type="number" step="0.0001" {...r('unit_net_weight', { valueAsNumber: true })} /></Field>
        <Field label="Gross weight per unit (kg)"><Input type="number" step="0.0001" {...r('unit_gross_weight', { valueAsNumber: true })} /></Field>
        <div className="flex items-end pb-2"><Checkbox label="Active" {...r('is_active')} /></div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
