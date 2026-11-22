import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/env';
import type { Profile, Role, Shipment } from '@/types/database';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearRecovery: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [recovery, setRecovery] = useState(false);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setRole(null);
      return;
    }
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('users_roles').select('role').eq('user_id', userId).maybeSingle(),
    ]);
    setProfile((p.data as Profile | null) ?? null);
    setRole(((r.data as { role: Role } | null)?.role ?? null) as Role | null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // defer DB calls out of the auth callback (supabase-js recommendation)
      setTimeout(() => {
        void loadProfile(s?.user.id);
      }, 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      role,
      loading,
      recovery,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setRole(null);
      },
      sendReset: async (email) => {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setRecovery(false);
      },
      refreshProfile: () => loadProfile(session?.user.id),
      clearRecovery: () => setRecovery(false),
    }),
    [session, profile, role, loading, recovery, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** UI-side permission helpers. The database enforces the same rules with RLS. */
export function usePermissions() {
  const { role, session } = useAuth();
  const uid = session?.user.id;
  const isAdmin = role === 'admin';
  const isManager = role === 'manager' || isAdmin;
  return {
    uid,
    role,
    isAdmin,
    isManager,
    canManageSettings: isAdmin,
    canReview: isManager,
    canDeletePayments: isManager,
    canViewAudit: isManager,
    canEditMaster: (createdBy: string | null) => isManager || (!!uid && createdBy === uid),
    canDeleteMaster: isAdmin,
    canEditShipment: (s: Pick<Shipment, 'created_by' | 'assigned_to'> | null | undefined) =>
      !!s && (isManager || (!!uid && (s.created_by === uid || s.assigned_to === uid))),
    canDeleteDocument: (doc: { uploaded_by: string | null }, s: Pick<Shipment, 'created_by' | 'assigned_to'> | null | undefined) =>
      isManager || (!!uid && doc.uploaded_by === uid && !!s && (s.created_by === uid || s.assigned_to === uid)),
  };
}
