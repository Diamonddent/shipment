import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

/**
 * Single Supabase client. Untyped generic on purpose: rows are cast to the
 * hand-written types in src/types/database.ts inside the service layer.
 */
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? env.supabaseUrl : 'http://localhost:54321',
  isSupabaseConfigured ? env.supabaseAnonKey : 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // PKCE puts ?code= in the query string, which plays well with HashRouter (#/route)
      flowType: 'pkce',
      storageKey: 'dd-shipment-auth',
    },
  },
);

/** A throw-away client used by admins to create users without replacing their own session. */
export function createIsolatedClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'dd-shipment-isolated' },
  });
}
