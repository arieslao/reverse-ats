import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { logout, isAdmin } from '../../lib/auth';
import { ThemeToggle } from '../../components/ThemeToggle';

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
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">You're signed in</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Signed in as <span className="font-medium">{user?.email}</span> · tier <span className="font-medium">{user?.tier}</span>
        </p>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          <HubCard to="/app/feed" title="Job feed" hint="Browse and filter scraped jobs. Save, dismiss, or generate a cover letter." />
          <HubCard to="/app/pipeline" title="Pipeline" hint="Saved jobs by stage — applied, phone screen, technical, offer." />
          <HubCard to="/app/profile" title="Profile" hint="Resume, target roles, locations, salary, and skill preferences." />
          <HubCard to="/app/analytics" title="Analytics" hint="Funnel + response rate + scoring coverage." />
        </div>
      </main>
    </div>
  );
}

function HubCard({ to, title, hint }: { to: string; title: string; hint: string }) {
  return (
    <Link
      to={to}
      className="block p-5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-accent)] transition-colors"
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{hint}</div>
    </Link>
  );
}
