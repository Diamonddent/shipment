import { useEffect } from 'react';
import type { UseFormReturn, FieldValues, Path, PathValue } from 'react-hook-form';
import { Field, Input, Select } from '@/components/ui';
import { useCurrencies } from '@/hooks/queries';

/**
 * Currency + exchange rate pair. Picking a currency suggests its current rate
 * (Settings → Currencies); the user can override it. The rate entered is stored
 * on the record and never changes when currency settings change later.
 */
export function CurrencyRateFields<T extends FieldValues>({
  form,
  currencyName,
  rateName,
  disabled,
  autoSuggest = true,
}: {
  form: UseFormReturn<T>;
  currencyName: Path<T>;
  rateName: Path<T>;
  disabled?: boolean;
  autoSuggest?: boolean;
}) {
  const currencies = useCurrencies();
  const code = form.watch(currencyName) as string;
  const { dirtyFields } = form.formState;
  const currencyDirty = Boolean((dirtyFields as Record<string, unknown>)[currencyName as string]);

  useEffect(() => {
    if (!currencies.data || !code) return;
    if (code === 'SAR') {
      form.setValue(rateName, 1 as PathValue<T, Path<T>>, { shouldValidate: true });
      return;
    }
    if (autoSuggest && currencyDirty) {
      const c = currencies.data.find((x) => x.code === code);
      if (c) form.setValue(rateName, Number(c.current_rate) as PathValue<T, Path<T>>, { shouldValidate: true, shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, currencies.data, currencyDirty]);

  const err = form.formState.errors as Record<string, { message?: string } | undefined>;
  return (
    <>
      <Field label="Currency" required error={err[currencyName as string]?.message}>
        <Select {...form.register(currencyName)} disabled={disabled}>
          {(currencies.data ?? []).filter((c) => c.is_active || c.code === code).map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
          {!currencies.data && <option value={code}>{code}</option>}
        </Select>
      </Field>
      <Field label="Exchange rate (1 unit = SAR)" required error={err[rateName as string]?.message} hint={code === 'SAR' ? 'SAR is always 1' : 'Rate at the invoice date'}>
        <Input type="number" step="0.000001" min="0" {...form.register(rateName, { valueAsNumber: true })} disabled={disabled || code === 'SAR'} />
      </Field>
    </>
  );
}
