import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { ThemeToggle } from '../../components/ThemeToggle';
import {
  dismissJob,
  fetchFeedIndustries,
  fetchJobs,
  generateCoverLetter,
  rescoreJobs,
  saveJob,
  type IndustryOption,
  type Job,
  type JobsQuery,
  type UsageState,
} from '../../lib/api';

const PAGE_SIZE = 20;

export default function FeedPage() {
  const { user } = useAuthStore();
  const [filters, setFilters] = useState<JobsQuery>({ page: 1, per_page: PAGE_SIZE, sort_by: 'score' });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [industries, setIndustries] = useState<IndustryOption[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [coverLetter, setCoverLetter] = useState<{
    jobId: string;
    text: string;
    loading: boolean;
    usage?: UsageState;
    capped?: boolean;
  } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreNotice, setScoreNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchFeedIndustries().then(setIndustries).catch(() => {});
  }, []);

  const load = async (q: JobsQuery) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJobs(q);
      setJobs(res.jobs);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(filters);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const update = (patch: Partial<JobsQuery>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const onDismiss = async (jobId: string) => {
    setBusyId(jobId);
    try {
      await dismissJob(jobId);
      setJobs((js) => js.filter((j) => j.id !== jobId));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dismiss failed');
    } finally {
      setBusyId(null);
    }
  };

  const onSave = async (jobId: string) => {
    setBusyId(jobId);
    try {
      await saveJob(jobId);
      setJobs((js) => js.filter((j) => j.id !== jobId));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) {
      const err = e as Error & { status?: number };
      // 429 → cap reached, surface friendly message + upgrade hint
      setError(err.message || 'Save failed');
    } finally {
      setBusyId(null);
    }
  };

  const onCoverLetter = async (jobId: string) => {
    setCoverLetter({ jobId, text: '', loading: true });
    try {
      const r = await generateCoverLetter(jobId);
      setCoverLetter({ jobId, text: r.cover_letter, loading: false, usage: r.usage });
    } catch (e) {
      const err = e as Error & { status?: number; usage?: UsageState };
      setCoverLetter({
        jobId,
        text: err.message || 'Failed',
        loading: false,
        usage: err.usage,
        capped: err.status === 429,
      });
    }
  };

  const onRescore = async () => {
    setScoring(true);
    setScoreNotice(null);
    try {
      const r = await rescoreJobs(false);
      const remainingHint = r.usage ? ` · ${r.usage.remaining}/${r.usage.limit} rescores left today` : '';
      setScoreNotice(r.scored > 0 ? `Scored ${r.scored} job${r.scored === 1 ? '' : 's'}${r.has_more ? ' — click again for the next batch' : ''}${remainingHint}` : (r.message || 'Nothing to score'));
      await load(filters);
    } catch (e) {
      setScoreNotice(e instanceof Error ? e.message : 'Rescore failed');
    } finally {
      setScoring(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/app" className="text-sm font-medium tracking-tight">Reverse ATS</Link>
            <nav className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <Link to="/app/feed" className="text-[var(--color-text-primary)]">Feed</Link>
              <Link to="/app/pipeline" className="hover:text-[var(--color-text-primary)]">Pipeline</Link>
              <Link to="/app/analytics" className="hover:text-[var(--color-text-primary)]">Analytics</Link>
              <Link to="/app/profile" className="hover:text-[var(--color-text-primary)]">Profile</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-secondary)]">{user?.email}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Job Feed</h1>
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
              {loading ? 'Loading…' : `${total} ${total === 1 ? 'match' : 'matches'}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {scoreNotice && <span className="text-xs text-[var(--color-text-secondary)]">{scoreNotice}</span>}
            <button
              onClick={onRescore}
              disabled={scoring}
              className="text-xs px-3 h-8 rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] disabled:opacity-50 cursor-pointer"
              title="Score new jobs against your profile"
            >
              {scoring ? 'Scoring…' : 'Score new jobs'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <input
            value={filters.search || ''}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search title, company, snippet"
            className="md:col-span-2 h-9 px-3 text-sm rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <select
            value={filters.category || ''}
            onChange={(e) => update({ category: e.target.value || undefined })}
            className="h-9 px-2 text-sm rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="">All industries</option>
            {industries.map((i) => (
              <option key={i.id} value={i.id}>{i.label} ({i.count})</option>
            ))}
          </select>
          <select
            value={filters.sort_by || 'score'}
            onChange={(e) => update({ sort_by: e.target.value as JobsQuery['sort_by'] })}
            className="h-9 px-2 text-sm rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="score">Sort: Best match</option>
            <option value="newest">Sort: Newest</option>
            <option value="company">Sort: Company A→Z</option>
          </select>
        </div>

        <div className="flex items-center gap-4 mb-4 text-xs text-[var(--color-text-secondary)]">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.remote_only || false}
              onChange={(e) => update({ remote_only: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            Remote only
          </label>
          <label className="flex items-center gap-1.5">
            Min score:
            <input
              type="number"
              value={filters.min_score || 0}
              onChange={(e) => update({ min_score: parseInt(e.target.value, 10) || 0 })}
              min={0}
              max={100}
              className="w-16 h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)]"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Last:
            <select
              value={filters.since_days || 0}
              onChange={(e) => update({ since_days: parseInt(e.target.value, 10) || 0 })}
              className="h-7 px-2 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)]"
            >
              <option value={0}>any time</option>
              <option value={1}>24 hours</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
        </div>

        {error && <div className="mb-4 text-xs text-[var(--color-danger,#dc2626)]">{error}</div>}

        {loading && jobs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
        ) : jobs.length === 0 ? (
          <div className="text-sm text-[var(--color-text-secondary)] py-8">
            No jobs match these filters. Try clearing some filters or click <strong>Score new jobs</strong> to add LLM scores to recent jobs.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                busy={busyId === job.id}
                onDismiss={() => onDismiss(job.id)}
                onSave={() => onSave(job.id)}
                onCoverLetter={() => onCoverLetter(job.id)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 text-xs text-[var(--color-text-secondary)]">
            <button
              onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page || 1) - 1) }))}
              disabled={filters.page === 1 || loading}
              className="px-3 h-8 rounded-md border border-[var(--color-border-muted)] disabled:opacity-30 cursor-pointer"
            >
              ← Prev
            </button>
            <span>Page {filters.page || 1} of {totalPages}</span>
            <button
              onClick={() => setFilters((f) => ({ ...f, page: Math.min(totalPages, (f.page || 1) + 1) }))}
              disabled={(filters.page || 1) >= totalPages || loading}
              className="px-3 h-8 rounded-md border border-[var(--color-border-muted)] disabled:opacity-30 cursor-pointer"
            >
              Next →
            </button>
          </div>
        )}
      </main>

      {coverLetter && (
        <CoverLetterModal
          state={coverLetter}
          onClose={() => setCoverLetter(null)}
          jobTitle={jobs.find((j) => j.id === coverLetter.jobId)?.title}
        />
      )}
    </div>
  );
}

function JobCard({
  job,
  busy,
  onDismiss,
  onSave,
  onCoverLetter,
}: {
  job: Job;
  busy: boolean;
  onDismiss: () => void;
  onSave: () => void;
  onCoverLetter: () => void;
}) {
  const score = job.llm_score;
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4 hover:border-[var(--color-accent)] transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-[var(--color-accent)] truncate">
              {job.title}
            </a>
            {score !== null && score !== undefined && (
              <span
                className="text-xs px-2 py-0.5 rounded-md"
                style={{
                  background: score >= 70 ? 'rgba(34,197,94,0.15)' : score >= 40 ? 'rgba(234,179,8,0.15)' : 'rgba(120,120,120,0.15)',
                  color: score >= 70 ? '#22c55e' : score >= 40 ? '#eab308' : 'var(--color-text-tertiary)',
                }}
              >
                {score}
              </span>
            )}
            {job.remote && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-[var(--color-bg-tinted,rgba(120,120,120,0.12))] text-[var(--color-text-tertiary)]">
                remote
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {job.company}
            {job.location && <> · {job.location}</>}
            {job.category && <> · {job.category}</>}
          </div>
          {job.description_snippet && (
            <p className="mt-2 text-xs text-[var(--color-text-secondary)] line-clamp-3">{job.description_snippet}</p>
          )}
          {job.llm_reasoning && (
            <p className="mt-2 text-xs italic text-[var(--color-text-tertiary)]">"{job.llm_reasoning}"</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button onClick={onSave} disabled={busy} className="text-xs px-3 h-7 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg,white)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 cursor-pointer">
            Save
          </button>
          <button onClick={onCoverLetter} disabled={busy} className="text-xs px-3 h-7 rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] disabled:opacity-50 cursor-pointer">
            Cover letter
          </button>
          <button onClick={onDismiss} disabled={busy} className="text-xs px-3 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer">
            Hide
          </button>
        </div>
      </div>
    </div>
  );
}

function CoverLetterModal({
  state,
  onClose,
  jobTitle,
}: {
  state: { jobId: string; text: string; loading: boolean; usage?: UsageState; capped?: boolean };
  onClose: () => void;
  jobTitle?: string;
}) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(state.text).catch(() => {});
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-subtle)]">
          <div>
            <div className="text-sm font-medium">Cover letter</div>
            {jobTitle && <div className="text-xs text-[var(--color-text-secondary)]">{jobTitle}</div>}
          </div>
          <div className="flex items-center gap-2">
            {state.usage && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {state.usage.remaining}/{state.usage.limit} left today
              </span>
            )}
            {!state.loading && state.text && !state.capped && (
              <button onClick={copyToClipboard} className="text-xs px-3 h-8 rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] cursor-pointer">
                Copy
              </button>
            )}
            <button onClick={onClose} className="text-xs px-3 h-8 rounded-md hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] cursor-pointer">
              Close
            </button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {state.loading ? (
            <p className="text-sm text-[var(--color-text-secondary)]">Generating… (~10–20s)</p>
          ) : state.capped ? (
            <div className="space-y-3">
              <p className="text-sm">{state.text}</p>
              <a
                href="/#pricing"
                className="inline-block text-xs px-3 h-8 leading-8 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg,white)] hover:bg-[var(--color-accent-hover)] cursor-pointer"
              >
                Upgrade to Sponsor
              </a>
            </div>
          ) : (
            <pre className="text-sm whitespace-pre-wrap font-sans">{state.text}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
