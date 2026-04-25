import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { loadProfile, type AuthUser } from '../lib/auth';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: AuthUser | null) => void;
  refresh: () => Promise<void>;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user, loading: false }),

  refresh: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      set({ user: null, loading: false });
      return;
    }
    const user = await loadProfile(session.user.id, session.user.email ?? '');
    set({ user, loading: false });
  },

  // Subscribe to Supabase auth events. INITIAL_SESSION fires once on boot
  // with the existing session (or null), so we don't need a separate
  // getUser/getSession call at startup — that would race with sign-in flows
  // and trigger NavigatorLockAcquireTimeout errors.
  initialize: () => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
          const user = await loadProfile(session.user.id, session.user.email ?? '');
          set({ user, loading: false, initialized: true });
        } else {
          set({ user: null, loading: false, initialized: true });
        }
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, loading: false, initialized: true });
      }
    });

    return () => subscription.unsubscribe();
  },
}));
