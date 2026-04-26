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

  // Subscribe to Supabase auth events. Any supabase.* call (including
  // PostgREST `from(...)`) inside this callback deadlocks the auth
  // processLock — `signInWithPassword` holds the lock and awaits listeners,
  // and `from('profiles')` re-acquires the same non-reentrant lock to read
  // the access token. Defer all supabase work via `setTimeout(..., 0)` so it
  // runs after the lock releases.
  initialize: () => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
          const userId = session.user.id;
          const email = session.user.email ?? '';
          setTimeout(async () => {
            const user = await loadProfile(userId, email);
            set({ user, loading: false, initialized: true });
          }, 0);
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
