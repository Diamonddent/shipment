import { createIsolatedClient, supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/types/database';
import { unwrap } from './base';

export interface UserRow extends Profile {
  role: Role;
}

export const usersService = {
  list: async (): Promise<UserRow[]> => {
    const profiles = unwrap(await supabase.from('profiles').select('*').order('full_name')) as Profile[];
    const roles = unwrap(await supabase.from('users_roles').select('user_id, role')) as { user_id: string; role: Role }[];
    const map = new Map(roles.map((r) => [r.user_id, r.role]));
    return profiles.map((p) => ({ ...p, role: map.get(p.id) ?? 'employee' }));
  },
  setRole: async (userId: string, role: Role) => {
    const res = unwrap(await supabase.from('users_roles').update({ role }).eq('user_id', userId).select()) as unknown[];
    if (!res.length) throw new Error('Role not updated — only administrators can change roles.');
  },
  setActive: async (userId: string, is_active: boolean) => {
    unwrap(await supabase.from('profiles').update({ is_active }).eq('id', userId));
  },
  updateProfile: async (userId: string, input: Partial<Pick<Profile, 'full_name' | 'phone' | 'job_title'>>) => {
    unwrap(await supabase.from('profiles').update(input).eq('id', userId));
  },
  /**
   * Creates a login with the public sign-up endpoint on an isolated client so
   * the admin's own session is untouched. The new user starts as Employee; the
   * role is then set by the admin. If e-mail confirmation is enabled in
   * Supabase, the user must confirm before signing in.
   */
  createUser: async (email: string, password: string, fullName: string, role: Role) => {
    const client = createIsolatedClient();
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) throw error;
    const id = data.user?.id;
    if (!id) throw new Error('User was not created.');
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('A user with this e-mail already exists.');
    }
    if (role !== 'employee') {
      // profile/role rows are created by the on_auth_user_created trigger
      for (let i = 0; i < 5; i++) {
        const res = await supabase.from('users_roles').update({ role }).eq('user_id', id).select();
        if (!res.error && res.data && res.data.length) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return { id, needsConfirmation: !data.session };
  },
};
