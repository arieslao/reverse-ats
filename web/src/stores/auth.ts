import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getUser, type AuthUser } from '../lib/auth';

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
    set({ loading: true });
    const user = await getUser();
    set({ user, loading: false });
  },

  initialize: () => {
    getUser().then((user) => {
      set({ user, loading: false, initialized: true });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const user = await getUser();
        set({ user, loading: false });
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  },
}));
