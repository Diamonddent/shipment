import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Field, Input, Modal, Textarea, useToast } from '@/components/ui';
import { forwardersService } from '@/services/masterData';
import { qk } from '@/hooks/queries';
import { COUNTRIES } from '@/lib/constants';
import { cleanPayload } from '@/lib/utils';
import type { FreightForwarder } from '@/types/database';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  country: z.string().optional(),
  contact_person: z.string().optional(),
  email: z.union([z.literal(''), z.string().trim().email('Invalid e-mail')]).optional(),
  phone: z.string().optional(),
  services: z.string().optional(),
  account_number: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean(),
});
type Form = z.infer<typeof schema>;

export function ForwarderFormModal({ open, onClose, forwarder, onSaved }: { open: boolean; onClose: () => void; forwarder?: FreightForwarder | null; onSaved?: (f: FreightForwarder) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open)
      form.reset({
        name: forwarder?.name ?? '',
        country: forwarder?.country ?? '',
        contact_person: forwarder?.contact_person ?? '',
        email: forwarder?.email ?? '',
        phone: forwarder?.phone ?? '',
        services: forwarder?.services ?? '',
        account_number: forwarder?.account_number ?? '',
        notes: forwarder?.notes ?? '',
        is_active: forwarder?.is_active ?? true,
      });
  }, [open, forwarder, form]);
  const save = useMutation({
    mutationFn: (v: Form) => {
      const payload = cleanPayload(v);
      return forwarder ? forwardersService.update(forwarder.id, payload) : forwardersService.create(payload);
    },
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: qk.forwarders });
      qc.invalidateQueries({ queryKey: qk.shipments });
      toast.success(forwarder ? 'Forwarder updated' : 'Forwarder created', f.name);
      onSaved?.(f);
      onClose();
    },
    onError: (e) => toast.error('Could not save forwarder', e),
  });
  const e = form.formState.errors;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={forwarder ? 'Edit freight forwarder' : 'New freight forwarder'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={form.handleSubmit((v) => save.mutate(v))} loading={save.isPending}>Save</Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        <Field label="Name" required error={e.name?.message} className="sm:col-span-2"><Input {...form.register('name')} invalid={!!e.name} /></Field>
        <Field label="Country"><Input list="dd-countries-ff" {...form.register('country')} /></Field>
        <Field label="Services" hint="e.g. Air, Sea, Courier, Clearance"><Input {...form.register('services')} /></Field>
        <Field label="Contact person"><Input {...form.register('contact_person')} /></Field>
        <Field label="E-mail" error={e.email?.message}><Input type="email" {...form.register('email')} /></Field>
        <Field label="Phone"><Input {...form.register('phone')} /></Field>
        <Field label="Account number"><Input {...form.register('account_number')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...form.register('notes')} /></Field>
        <Checkbox label="Active" {...form.register('is_active')} />
        <datalist id="dd-countries-ff">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
