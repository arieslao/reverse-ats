import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { hasTier } from '../../lib/auth';
import type { Tier } from '../../lib/supabase';

export default function RequireTier({ tier }: { tier: Tier }) {
  const { user, loading, initialized } = useAuthStore();

  if (!initialized || loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm opacity-60">Loading…</div>;
  }

  if (!user) return <Navigate to="/sign-in" replace />;
  if (!hasTier(user, tier)) return <Navigate to="/app" replace />;

  return <Outlet />;
}
