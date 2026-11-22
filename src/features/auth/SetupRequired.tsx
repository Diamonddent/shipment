import { AuthShell } from './AuthShell';

export default function SetupRequired() {
  return (
    <AuthShell>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Configuration required</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        This build has no Supabase connection. Set <code className="rounded bg-slate-100 px-1 dark:bg-navy-800">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-slate-100 px-1 dark:bg-navy-800">VITE_SUPABASE_ANON_KEY</code> (locally in <code>.env</code>, or as GitHub repository
        secrets for the Pages deployment) and rebuild. See README → “Supabase configuration”.
      </p>
    </AuthShell>
  );
}
