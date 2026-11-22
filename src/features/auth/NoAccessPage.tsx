import { Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { AuthShell } from './AuthShell';

export default function NoAccessPage({ reason }: { reason: 'inactive' | 'norole' }) {
  const { signOut, session } = useAuth();
  return (
    <AuthShell>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Access not available</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {reason === 'inactive'
          ? 'Your account has been deactivated. Please contact your administrator.'
          : 'Your account has no role assigned yet. Ask an administrator to assign you a role in Settings → Users & roles.'}
      </p>
      <p className="mt-2 text-xs text-slate-500">Signed in as {session?.user.email}</p>
      <Button className="mt-6" variant="outline" onClick={() => void signOut()}>
        Sign out
      </Button>
    </AuthShell>
  );
}
