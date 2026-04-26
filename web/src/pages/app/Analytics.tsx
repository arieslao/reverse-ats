import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { fetchAnalytics, fetchScoringStats, type AnalyticsResult, type ScoringStats } from '../../lib/api';

const STAGE_LABEL: Record<string, string> = {
  saved: 'Saved',
  applied: 'Applied',
  phone_screen: 'Phone screen',
  technical: 'Technical',
  final: 'Final',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const STAGE_ORDER = ['saved', 'applied', 'phone_screen', 'technical', 'final', 'offer', 'rejected', 'withdrawn'];

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [scoring, setScoring] = useState<ScoringStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAnalytics(), fetchScoringStats()])
      .then(([a, s]) => {
        setData(a);
        setScoring(s);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const max = data ? Math.max(1, ...data.funnel.map((f) => f.count)) : 1;
  const orderedFunnel = data
    ? STAGE_ORDER.map((s) => ({ stage: s, count: data.funnel.find((f) => f.stage === s)?.count || 0 })).filter(
        (f) => f.count > 0,
      )
    : [];

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/app" className="text-sm font-medium tracking-tight">Reverse ATS</Link>
            <nav className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <Link to="/app/feed" className="hover:text-[var(--color-text-primary)]">Feed</Link>
              <Link to="/app/pipeline" className="hover:text-[var(--color-text-primary)]">Pipeline</Link>
              <Link to="/app/analytics" className="text-[var(--color-text-primary)]">Analytics</Link>
              <Link to="/app/profile" className="hover:text-[var(--color-text-primary)]">Profile</Link>
            </nav>
          </div>
          <span className="text-xs text-[var(--color-text-secondary)]">{user?.email}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">Your job-search funnel at a glance.</p>
        </div>

        {error && <div className="mb-4 text-xs text-[var(--color-danger,#dc2626)]">{error}</div>}

        {loading ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
        ) : data ? (
          <div className="flex flex-col gap-8">
            {/* Top stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Saved" value={data.total_saved} />
              <Stat label="Applied" value={data.total_applied} />
              <Stat label="Response rate" value={`${data.response_rate}%`} hint="phone+ / applied" />
              <Stat label="Hidden" value={data.total_dismissed} />
            </div>

            {/* Funnel */}
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">
                Pipeline funnel
              </h2>
              {orderedFunnel.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No saved jobs yet.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {orderedFunnel.map((f) => (
                    <div key={f.stage} className="flex items-center gap-3">
                      <div className="w-32 text-xs text-[var(--color-text-secondary)]">{STAGE_LABEL[f.stage] || f.stage}</div>
                      <div className="flex-1 h-6 bg-[var(--color-bg-elevated)] rounded-md overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-accent)]"
                          style={{ width: `${(f.count / max) * 100}%`, minWidth: 4 }}
                        />
                      </div>
                      <div className="w-10 text-right text-xs">{f.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Scoring coverage */}
            {scoring && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">
                  AI scoring coverage
                </h2>
                <div className="text-sm text-[var(--color-text-secondary)]">
                  {scoring.scored} of {scoring.total} active jobs scored
                  {scoring.unscored > 0 && (
                    <>
                      {' '} · <Link to="/app/feed" className="text-[var(--color-accent)] hover:underline">Score {scoring.unscored} more</Link>
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4">
      <div className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{hint}</div>}
    </div>
  );
}
