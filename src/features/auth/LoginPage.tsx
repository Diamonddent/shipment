import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Alert, Button, Field, Input } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { AuthShell } from './AuthShell';

const schema = z.object({
  email: z.string().trim().email('Enter a valid e-mail address'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const { session, loading, signIn, sendReset } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const { register, handleSubmit, formState, getValues } = useForm<Form>({ resolver: zodResolver(schema) });

  if (!loading && session) return <Navigate to="/" replace />;

  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      await signIn(v.email, v.password);
    } catch (e) {
      setError(/invalid login/i.test(errorMessage(e)) ? 'Incorrect e-mail or password.' : errorMessage(e));
    }
  };

  const onReset = async () => {
    const email = getValues('email');
    if (!z.string().email().safeParse(email).success) {
      setError('Enter your e-mail address first.');
      return;
    }
    setError(null);
    try {
      await sendReset(email);
      setInfo('If an account exists for this e-mail, a password reset link has been sent.');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">{resetMode ? 'Reset password' : 'Sign in'}</h2>
      <p className="mt-1 text-sm text-slate-500">{resetMode ? 'We will e-mail you a secure reset link.' : 'Use the account provided by your administrator.'}</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {error && <Alert tone="red">{error}</Alert>}
        {info && <Alert tone="green">{info}</Alert>}
        <Field label="E-mail" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" placeholder="name@diamonddent.com" {...register('email')} invalid={!!formState.errors.email} />
        </Field>
        {!resetMode && (
          <Field label="Password" error={formState.errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register('password')} invalid={!!formState.errors.password} />
          </Field>
        )}
        {resetMode ? (
          <Button className="w-full" size="lg" onClick={onReset} icon={<Mail className="h-4 w-4" />}>
            Send reset link
          </Button>
        ) : (
          <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting} icon={<LogIn className="h-4 w-4" />}>
            Sign in
          </Button>
        )}
        <button
          type="button"
          onClick={() => {
            setResetMode((m) => !m);
            setError(null);
            setInfo(null);
          }}
          className="w-full text-center text-sm text-accent hover:underline"
        >
          {resetMode ? 'Back to sign in' : 'Forgot your password?'}
        </button>
      </form>
    </AuthShell>
  );
}
