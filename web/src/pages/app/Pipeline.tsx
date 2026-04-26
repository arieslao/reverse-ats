import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import {
  deletePipelineEntry,
  fetchPipeline,
  generateCoverLetter,
  updatePipelineEntry,
  type PipelineEntry,
  type PipelineStage,
} from '../../lib/api';

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: 'saved', label: 'Saved' },
  { id: 'applied', label: 'Applied' },
  { id: 'phone_screen', label: 'Phone screen' },
  { id: 'technical', label: 'Technical' },
  { id: 'final', label: 'Final' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'withdrawn', label: 'Withdrawn' },
];

export default function PipelinePage() {
  const { user } = useAuthStore();
  const [byStage, setByStage] = useState<Record<string, PipelineEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [coverLetter, setCoverLetter] = useState<{ jobId: string; jobTitle: string; text: string; loading: boolean } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchPipeline();
      setByStage(r.by_stage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onChangeStage = async (id: number, stage: PipelineStage) => {
    setBusyId(id);
    try {
      await updatePipelineEntry(id, { stage });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm('Remove this job from your pipeline?')) return;
    setBusyId(id);
    try {
      await deletePipelineEntry(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const onCoverLetter = async (jobId: string, jobTitle: string) => {
    setCoverLetter({ jobId, jobTitle, text: '', loading: true });
    try {
      const r = await generateCoverLetter(jobId);
      setCoverLetter({ jobId, jobTitle, text: r.cover_letter, loading: false });
    } catch (e) {
      setCoverLetter({ jobId, jobTitle, text: e instanceof Error ? e.message : 'Failed', loading: false });
    }
  };

  const total = Object.values(byStage).reduce((a, b) => a + b.length, 0);

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/app" className="text-sm font-medium tracking-tight">Reverse ATS</Link>
            <nav className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <Link to="/app/feed" className="hover:text-[var(--color-text-primary)]">Feed</Link>
              <Link to="/app/pipeline" className="text-[var(--color-text-primary)]">Pipeline</Link>
              <Link to="/app/analytics" className="hover:text-[var(--color-text-primary)]">Analytics</Link>
              <Link to="/app/profile" className="hover:text-[var(--color-text-primary)]">Profile</Link>
            </nav>
          </div>
          <span className="text-xs text-[var(--color-text-secondary)]">{user?.email}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            {loading ? 'Loading…' : `${total} job${total === 1 ? '' : 's'} across all stages`}
          </p>
        </div>

        {error && <div className="mb-4 text-xs text-[var(--color-danger,#dc2626)]">{error}</div>}

        {!loading && total === 0 ? (
          <div className="text-sm text-[var(--color-text-secondary)] py-12 text-center">
            No saved jobs yet. <Link to="/app/feed" className="text-[var(--color-accent)] hover:underline">Browse the feed</Link> and click Save.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {STAGES.map((stage) => {
              const items = byStage[stage.id] || [];
              if (items.length === 0) return null;
              return (
                <section key={stage.id}>
                  <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">
                    {stage.label} ({items.length})
                  </h2>
                  <div className="flex flex-col gap-2">
                    {items.map((entry) => (
                      <PipelineRow
                        key={entry.id}
                        entry={entry}
                        busy={busyId === entry.id}
                        onChangeStage={(s) => onChangeStage(entry.id, s)}
                        onDelete={() => onDelete(entry.id)}
                        onCoverLetter={() => onCoverLetter(entry.job_id, entry.title)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {coverLetter && (
        <CoverLetterModal state={coverLetter} onClose={() => setCoverLetter(null)} />
      )}
    </div>
  );
}

function PipelineRow({
  entry,
  busy,
  onChangeStage,
  onDelete,
  onCoverLetter,
}: {
  entry: PipelineEntry;
  busy: boolean;
  onChangeStage: (s: PipelineStage) => void;
  onDelete: () => void;
  onCoverLetter: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[260px]">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium hover:text-[var(--color-accent)]"
        >
          {entry.title}
        </a>
        <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
          {entry.company}
          {entry.location && <> · {entry.location}</>}
          {entry.llm_score !== null && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0 rounded-md text-[10px]"
              style={{
                background: entry.llm_score >= 70 ? 'rgba(34,197,94,0.15)' : entry.llm_score >= 40 ? 'rgba(234,179,8,0.15)' : 'rgba(120,120,120,0.15)',
                color: entry.llm_score >= 70 ? '#22c55e' : entry.llm_score >= 40 ? '#eab308' : 'var(--color-text-tertiary)',
              }}
            >score {entry.llm_score}</span>
          )}
          {entry.applied_at && <> · applied {new Date(entry.applied_at).toLocaleDateString()}</>}
        </div>
      </div>
      <select
        value={entry.stage}
        onChange={(e) => onChangeStage(e.target.value as PipelineStage)}
        disabled={busy}
        className="h-8 px-2 text-xs rounded-md bg-[var(--color-bg-base)] border border-[var(--color-border-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        {STAGES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      <button onClick={onCoverLetter} disabled={busy} className="text-xs px-3 h-8 rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] disabled:opacity-50 cursor-pointer">
        Cover letter
      </button>
      <button onClick={onDelete} disabled={busy} className="text-xs px-3 h-8 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-danger,#dc2626)] cursor-pointer">
        Remove
      </button>
    </div>
  );
}

function CoverLetterModal({
  state,
  onClose,
}: {
  state: { jobId: string; jobTitle: string; text: string; loading: boolean };
  onClose: () => void;
}) {
  const copy = () => navigator.clipboard.writeText(state.text).catch(() => {});
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-subtle)]">
          <div>
            <div className="text-sm font-medium">Cover letter</div>
            <div className="text-xs text-[var(--color-text-secondary)]">{state.jobTitle}</div>
          </div>
          <div className="flex items-center gap-2">
            {!state.loading && state.text && (
              <button onClick={copy} className="text-xs px-3 h-8 rounded-md border border-[var(--color-border-muted)] cursor-pointer">Copy</button>
            )}
            <button onClick={onClose} className="text-xs px-3 h-8 rounded-md cursor-pointer">Close</button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {state.loading ? (
            <p className="text-sm text-[var(--color-text-secondary)]">Generating…</p>
          ) : (
            <pre className="text-sm whitespace-pre-wrap font-sans">{state.text}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
