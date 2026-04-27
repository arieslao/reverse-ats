import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { ThemeToggle } from '../../components/ThemeToggle';
import { fetchAdminUsers, updateUserTier, type AdminUser, type Tier } from '../../lib/api';

const TIERS: Tier[] = ['free', 'sponsor', 'admin'];

export default function AdminIndex() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchAdminUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleTierChange = async (userId: string, tier: Tier) => {
    setSavingId(userId);
    try {
      const updated = await updateUserTier(userId, tier);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, tier: updated.tier } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update tier');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="text-sm font-medium tracking-tight shrink-0 truncate">Reverse ATS · Admin</Link>
          <div className="flex items-center gap-3 sm:gap-4 text-xs text-[var(--color-text-secondary)] min-w-0">
            <Link to="/app" className="hover:text-[var(--color-text-primary)] whitespace-nowrap">Back to app</Link>
            <span className="hidden md:inline truncate max-w-[180px]">{user?.email}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {loading ? 'Loading…' : `${users.length} ${users.length === 1 ? 'user' : 'users'}`}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-3 h-8 rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 rounded-md px-4 py-2 text-sm text-[var(--color-danger)] mb-6">
            {error}
          </div>
        )}

        {!loading && users.length === 0 && !error && (
          <p className="text-sm text-[var(--color-text-secondary)]">No users yet.</p>
        )}

        {users.length > 0 && (
          <div className="border border-[var(--color-border-subtle)] rounded-lg overflow-hidden bg-[var(--color-bg-elevated)]">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] bg-[var(--color-bg-section)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Tier</th>
                  <th className="text-left px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-[var(--color-border-subtle)]">
                    <td className="px-4 py-3">
                      <span className="font-medium">{u.email}</span>
                      {u.id === user?.id && (
                        <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.tier}
                        disabled={savingId === u.id || u.id === user?.id}
                        onChange={(e) => handleTierChange(u.id, e.target.value as Tier)}
                        className="text-xs px-2 h-7 rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-base)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        title={u.id === user?.id ? "Can't change your own tier here" : undefined}
                      >
                        {TIERS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
