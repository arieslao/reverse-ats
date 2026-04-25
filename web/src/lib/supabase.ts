import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL) {
  console.warn('[supabase] VITE_SUPABASE_URL not set — auth will not work');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type Tier = 'free' | 'sponsor' | 'admin';

export interface Profile {
  id: string;
  email: string;
  tier: Tier;
  created_at: string;
  updated_at: string;
}
