import { createClient, processLock } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missing = [
    !SUPABASE_URL && 'VITE_SUPABASE_URL',
    !SUPABASE_ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean).join(' and ');
  throw new Error(
    `[supabase] ${missing} is missing from the build. ` +
      `These must be set as Variables (not Secrets) in Cloudflare Pages → ` +
      `reverse-ats → Settings → Variables and Secrets, for BOTH Production and Preview, ` +
      `then the deployment must be re-run (env vars are inlined at build time, not runtime). ` +
      `For local dev, set them in web/.env.local.`,
  );
}

// processLock = in-tab lock instead of the cross-tab Web Locks API.
// Web Locks cause `NavigatorLockAcquireTimeoutError` when concurrent auth
// operations race for the token (e.g. signInWithPassword + the SIGNED_IN
// event handler firing loadProfile at the same moment). For a single-tab
// SPA the cross-tab coordination is unnecessary and the in-tab lock is
// the Supabase-recommended choice.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    lock: processLock,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Tier = 'free' | 'sponsor' | 'admin';

export interface Profile {
  id: string;
  email: string;
  tier: Tier;
  created_at: string;
  updated_at: string;
}

// Cached access token, kept in sync via onAuthStateChange. Synchronous read
// avoids contending on the auth processLock — getSession() can deadlock when
// a refresh races with another auth op and the lock isn't released.
let cachedAccessToken: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  cachedAccessToken = session?.access_token ?? null;
});
export function getAccessToken(): string | null {
  return cachedAccessToken;
}
