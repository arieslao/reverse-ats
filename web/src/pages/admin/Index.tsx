import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';

export default function AdminIndex() {
  const { user } = useAuthStore();

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="text-sm font-medium tracking-tight">Reverse ATS · Admin</Link>
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
            <Link to="/app" className="hover:text-[var(--color-text-primary)]">Back to app</Link>
            <span>{user?.email}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Tier <span className="font-medium">{user?.tier}</span>
        </p>
        <p className="mt-8 text-sm text-[var(--color-text-secondary)] max-w-prose">
          User management, scrape controls, industry packs, and tier overrides land here as
          the Worker endpoints get ported off the local backend.
        </p>
      </main>
    </div>
  );
}
