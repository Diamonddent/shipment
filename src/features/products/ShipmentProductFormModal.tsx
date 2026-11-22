import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, Modal, Select, useToast } from '@/components/ui';
import { CurrencyRateFields } from '@/features/shared/CurrencyRateFields';
import { qk, useProducts } from '@/hooks/queries';
import { shipmentProductsService, type ShipmentProductInput } from '@/services/shipmentProducts';
import { productsService } from '@/services/masterData';
import { productInvoiceValue, productInvoiceValueSar } from '@/lib/calculations';
import { fmtAmount, fmtMoney } from '@/lib/format';
import { cleanPayload, invalidFormHandler } from '@/lib/utils';
import type { Shipment, ShipmentProduct } from '@/types/database';

const optNum = z.preprocess((v) => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v), z.number().min(0, 'Cannot be negative').optional());
const schema = z
  .object({
    product_id: z.string().optional(),
    item_code: z.string().trim().min(1, 'Item code is required'),
    description: z.string().trim().min(1, 'Description is required'),
    manufacturer: z.string().optional(),
    brand: z.string().optional(),
    hs_code: z.string().optional(),
    country_of_origin: z.string().optional(),
    quantity: z.number({ invalid_type_error: 'Enter quantity' }).positive('Must be greater than 0'),
    unit_of_measure: z.string().min(1),
    unit_price: z.number({ invalid_type_error: 'Enter unit price' }).min(0),
    currency_code: z.string().min(3),
    exchange_rate: z.number({ invalid_type_error: 'Enter rate' }).positive(),
    net_weight: optNum,
    gross_weight: optNum,
    volume_cbm: optNum,
    lot_number: z.string().optional(),
    expiry_date: z.string().optional(),
    save_to_catalogue: z.boolean().optional(),
  })
  .refine((v) => v.net_weight === undefined || v.gross_weight === undefined || v.gross_weight >= v.net_weight, {
    message: 'Gross weight is normally ≥ net weight',
    path: ['gross_weight'],
  });
type Form = z.infer<typeof schema>;

export function ShipmentProductFormModal({
  open,
  onClose,
  shipment,
  line,
}: {
  open: boolean;
  onClose: () => void;
  shipment: Pick<Shipment, 'id' | 'currency_code' | 'exchange_rate' | 'country_of_origin'>;
  line?: ShipmentProduct | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const catalogue = useProducts();
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  const { register, watch, setValue, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (!open) return;
    form.reset({
      product_id: line?.product_id ?? '',
      item_code: line?.item_code ?? '',
      description: line?.description ?? '',
      manufacturer: line?.manufacturer ?? '',
      brand: line?.brand ?? '',
      hs_code: line?.hs_code ?? '',
      country_of_origin: line?.country_of_origin ?? shipment.country_of_origin ?? '',
      quantity: line ? Number(line.quantity) : (undefined as unknown as number),
      unit_of_measure: line?.unit_of_measure ?? 'PCS',
      unit_price: line ? Number(line.unit_price) : (undefined as unknown as number),
      currency_code: line?.currency_code ?? shipment.currency_code,
      exchange_rate: line ? Number(line.exchange_rate) : Number(shipment.exchange_rate),
      net_weight: line?.net_weight ?? undefined,
      gross_weight: line?.gross_weight ?? undefined,
      volume_cbm: line?.volume_cbm ?? undefined,
      lot_number: line?.lot_number ?? '',
      expiry_date: line?.expiry_date ?? '',
      save_to_catalogue: false,
    });
  }, [open, line, shipment, form]);

  const pickProduct = (id: string) => {
    setValue('product_id', id);
    const p = catalogue.data?.find((x) => x.id === id);
    if (!p) return;
    setValue('item_code', p.item_code, { shouldValidate: true });
    setValue('description', p.description, { shouldValidate: true });
    setValue('manufacturer', p.manufacturer ?? '');
    setValue('brand', p.brand ?? '');
    setValue('hs_code', p.hs_code ?? '');
    if (p.country_of_origin) setValue('country_of_origin', p.country_of_origin);
    setValue('unit_of_measure', p.unit_of_measure);
    if (p.default_unit_price !== null && p.default_currency === form.getValues('currency_code')) setValue('unit_price', Number(p.default_unit_price));
  };

  // per-unit catalogue weights x quantity
  const qty = Number(watch('quantity')) || 0;
  const productId = watch('product_id');
  useEffect(() => {
    const p = catalogue.data?.find((x) => x.id === productId);
    if (!p || !qty || line) return;
    if (p.unit_net_weight) setValue('net_weight', Math.round(qty * Number(p.unit_net_weight) * 1000) / 1000);
    if (p.unit_gross_weight) setValue('gross_weight', Math.round(qty * Number(p.unit_gross_weight) * 1000) / 1000);
  }, [qty, productId, catalogue.data, setValue, line]);

  const price = Number(watch('unit_price')) || 0;
  const rate = Number(watch('exchange_rate')) || 0;
  const currency = watch('currency_code');

  const save = useMutation({
    mutationFn: async (v: Form) => {
      const { save_to_catalogue, ...rest } = v;
      let productIdToUse = rest.product_id || null;
      if (save_to_catalogue && !productIdToUse) {
        const p = await productsService.create(
          cleanPayload({
            item_code: rest.item_code,
            description: rest.description,
            manufacturer: rest.manufacturer,
            brand: rest.brand,
            hs_code: rest.hs_code,
            country_of_origin: rest.country_of_origin,
            unit_of_measure: rest.unit_of_measure,
            default_unit_price: rest.unit_price,
            default_currency: rest.currency_code,
            unit_net_weight: rest.net_weight !== undefined ? Math.round((rest.net_weight / rest.quantity) * 10000) / 10000 : null,
            unit_gross_weight: rest.gross_weight !== undefined ? Math.round((rest.gross_weight / rest.quantity) * 10000) / 10000 : null,
            is_active: true,
          }),
        );
        productIdToUse = p.id;
      }
      const payload = cleanPayload({ ...rest, product_id: productIdToUse, shipment_id: shipment.id }) as ShipmentProductInput;
      return line ? shipmentProductsService.update(line.id, payload) : shipmentProductsService.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shipmentProducts(shipment.id) });
      qc.invalidateQueries({ queryKey: qk.allShipmentProducts });
      qc.invalidateQueries({ queryKey: qk.products });
      toast.success(line ? 'Product line updated' : 'Product added');
      onClose();
    },
    onError: (err) => toast.error('Could not save product', err),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={line ? 'Edit product line' : 'Add product to shipment'}
      subtitle="Product Invoice Value = Quantity × Unit Price × Exchange Rate"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={form.handleSubmit((v) => save.mutate(v), invalidFormHandler(toast))} loading={save.isPending}>{line ? 'Save' : 'Add product'}</Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={form.handleSubmit((v) => save.mutate(v), invalidFormHandler(toast))} noValidate>
        <Field label="Pick from product catalogue" hint="Optional — fills the fields below">
          <Select value={productId ?? ''} onChange={(ev) => pickProduct(ev.target.value)}>
            <option value="">— New / manual entry —</option>
            {(catalogue.data ?? []).filter((p) => p.is_active || p.id === productId).map((p) => (
              <option key={p.id} value={p.id}>{p.item_code} — {p.description}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Item code" required error={e.item_code?.message}><Input {...register('item_code')} invalid={!!e.item_code} /></Field>
          <Field label="Product description" required error={e.description?.message} className="sm:col-span-2 lg:col-span-3"><Input {...register('description')} invalid={!!e.description} /></Field>
          <Field label="Manufacturer"><Input {...register('manufacturer')} /></Field>
          <Field label="Brand"><Input {...register('brand')} /></Field>
          <Field label="HS code"><Input {...register('hs_code')} /></Field>
          <Field label="Country of origin"><Input {...register('country_of_origin')} /></Field>
          <Field label="Quantity" required error={e.quantity?.message}><Input type="number" step="0.001" min="0" {...register('quantity', { valueAsNumber: true })} invalid={!!e.quantity} /></Field>
          <Field label="Unit of measure"><Input {...register('unit_of_measure')} /></Field>
          <Field label={`Unit price (${currency || '—'})`} required error={e.unit_price?.message}><Input type="number" step="0.0001" min="0" {...register('unit_price', { valueAsNumber: true })} invalid={!!e.unit_price} /></Field>
          <div className="rounded-lg bg-accent-50/70 px-3 py-2 dark:bg-navy-800">
            <p className="text-[11px] text-slate-500">Total invoice value</p>
            <p className="text-sm font-semibold tabular-nums">{currency} {fmtAmount(productInvoiceValue(qty, price))}</p>
            <p className="text-sm font-semibold tabular-nums text-primary dark:text-white">{fmtMoney(productInvoiceValueSar(qty, price, rate))}</p>
          </div>
          <CurrencyRateFields form={form} currencyName="currency_code" rateName="exchange_rate" />
          <Field label="Net weight (kg, line total)" error={e.net_weight?.message as string | undefined}><Input type="number" step="0.001" min="0" {...register('net_weight', { valueAsNumber: true })} /></Field>
          <Field label="Gross weight (kg, line total)" error={e.gross_weight?.message as string | undefined}><Input type="number" step="0.001" min="0" {...register('gross_weight', { valueAsNumber: true })} /></Field>
          <Field label="Volume (CBM)"><Input type="number" step="0.0001" min="0" {...register('volume_cbm', { valueAsNumber: true })} /></Field>
          <Field label="Lot number"><Input {...register('lot_number')} /></Field>
          <Field label="Expiry date"><Input type="date" {...register('expiry_date')} /></Field>
        </div>
        {!line && !productId && (
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4 rounded border-line" {...register('save_to_catalogue')} /> Also save this item to the product catalogue
          </label>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
