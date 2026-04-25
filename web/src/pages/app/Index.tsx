import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { logout, isAdmin } from '../../lib/auth';

export default function AppIndex() {
  const { user, setUser } = useAuthStore();

  const handleSignOut = async () => {
    await logout();
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="text-sm font-medium tracking-tight">Reverse ATS</Link>
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
            <span>{user?.email}</span>
            {isAdmin(user) && (
              <Link to="/admin" className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">Admin</Link>
            )}
            <button onClick={handleSignOut} className="hover:text-[var(--color-text-primary)] cursor-pointer">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">You're signed in</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Signed in as <span className="font-medium">{user?.email}</span> · tier <span className="font-medium">{user?.tier}</span>
        </p>
        <p className="mt-8 text-sm text-[var(--color-text-secondary)] max-w-prose">
          The hosted Reverse ATS app is being ported here. Job feed, pipeline, AI scoring,
          and your profile all land in this space across the next few releases.
        </p>
      </main>
    </div>
  );
}
