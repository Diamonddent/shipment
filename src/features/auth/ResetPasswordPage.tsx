import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { Alert, Button, Field, Input, Spinner, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { AuthShell } from './AuthShell';

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type Form = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  if (loading) return <Spinner className="min-h-screen" />;
  if (!session) return <Navigate to="/login" replace />;

  const onSubmit = async (v: Form) => {
    try {
      await updatePassword(v.password);
      toast.success('Password updated');
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Set a new password</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="New password" error={formState.errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Confirm password" error={formState.errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
