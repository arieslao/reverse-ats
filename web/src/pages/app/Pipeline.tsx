import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { ThemeToggle } from '../../components/ThemeToggle';
import {
  deletePipelineEntry,
  fetchPipeline,
  fetchPipelineEvents,
  generateCoverLetter,
  updatePipelineEntry,
  type PipelineEntry,
  type PipelineEvent,
  type PipelineStage,
  type UsageState,
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
  const [view, setView] = useState<'list' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'list';
    return (localStorage.getItem('pipeline_view') as 'list' | 'kanban' | null) || 'list';
  });
  const setViewPersist = (v: 'list' | 'kanban') => {
    setView(v);
    try { localStorage.setItem('pipeline_view', v); } catch { /* private mode */ }
  };
  const [coverLetter, setCoverLetter] = useState<{
    jobId: string;
    jobTitle: string;
    text: string;
    loading: boolean;
    usage?: UsageState;
    capped?: boolean;
  } | null>(null);

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
      setCoverLetter({ jobId, jobTitle, text: r.cover_letter, loading: false, usage: r.usage });
    } catch (e) {
      const err = e as Error & { status?: number; usage?: UsageState };
      setCoverLetter({
        jobId,
        jobTitle,
        text: err.message || 'Failed',
        loading: false,
        usage: err.usage,
        capped: err.status === 429,
      });
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-secondary)]">{user?.email}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className={`mx-auto px-6 py-8 ${view === 'kanban' ? 'max-w-[1500px]' : 'max-w-6xl'}`}>
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
              {loading ? 'Loading…' : `${total} job${total === 1 ? '' : 's'} across all stages`}
            </p>
          </div>
          <div className="inline-flex rounded-md border border-[var(--color-border-muted)] overflow-hidden text-xs">
            <button
              onClick={() => setViewPersist('list')}
              className={`px-3 h-8 cursor-pointer transition-colors ${view === 'list' ? 'bg-[var(--color-bg-tinted,rgba(120,120,120,0.12))] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
            >
              List
            </button>
            <button
              onClick={() => setViewPersist('kanban')}
              className={`px-3 h-8 cursor-pointer transition-colors border-l border-[var(--color-border-muted)] ${view === 'kanban' ? 'bg-[var(--color-bg-tinted,rgba(120,120,120,0.12))] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
            >
              Kanban
            </button>
          </div>
        </div>

        {error && <div className="mb-4 text-xs text-[var(--color-danger,#dc2626)]">{error}</div>}

        {!loading && total === 0 ? (
          <div className="text-sm text-[var(--color-text-secondary)] py-12 text-center">
            No saved jobs yet. <Link to="/app/feed" className="text-[var(--color-accent)] hover:underline">Browse the feed</Link> and click Save.
          </div>
        ) : view === 'kanban' ? (
          <KanbanBoard
            byStage={byStage}
            busyId={busyId}
            onChangeStage={onChangeStage}
            onDelete={onDelete}
            onCoverLetter={onCoverLetter}
          />
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
  const [showHistory, setShowHistory] = useState(false);
  const [events, setEvents] = useState<PipelineEvent[] | null>(null);
  const [evtError, setEvtError] = useState<string | null>(null);

  // Invalidate cached events whenever the stage changes so reopening
  // the history panel re-fetches and shows the new transition.
  useEffect(() => {
    setEvents(null);
  }, [entry.stage]);

  const toggleHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (events !== null) return; // already loaded
    try {
      const list = await fetchPipelineEvents(entry.id);
      setEvents(list);
    } catch (e) {
      setEvtError(e instanceof Error ? e.message : 'Failed to load history');
    }
  };

  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
      <div className="p-3 flex items-center gap-3 flex-wrap">
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
        <button onClick={toggleHistory} className="text-xs px-3 h-8 rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] cursor-pointer" title="Stage history">
          {showHistory ? 'Hide history' : 'History'}
        </button>
        <button onClick={onCoverLetter} disabled={busy} className="text-xs px-3 h-8 rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] disabled:opacity-50 cursor-pointer">
          Cover letter
        </button>
        <button onClick={onDelete} disabled={busy} className="text-xs px-3 h-8 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-danger,#dc2626)] cursor-pointer">
          Remove
        </button>
      </div>
      {showHistory && (
        <div className="border-t border-[var(--color-border-subtle)] p-3 pl-5 bg-[var(--color-bg-base)] rounded-b-lg">
          {evtError ? (
            <div className="text-xs text-[var(--color-danger,#dc2626)]">{evtError}</div>
          ) : events === null ? (
            <div className="text-xs text-[var(--color-text-secondary)]">Loading history…</div>
          ) : events.length === 0 ? (
            <div className="text-xs text-[var(--color-text-tertiary)]">No history yet.</div>
          ) : (
            <ul className="flex flex-col gap-1.5 text-xs text-[var(--color-text-secondary)]">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2">
                  <span className="text-[var(--color-text-tertiary)] tabular-nums whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                  <span>·</span>
                  <span>
                    {e.from_stage ? (
                      <>
                        {STAGE_LABEL(e.from_stage)} → <span className="text-[var(--color-text-primary)]">{STAGE_LABEL(e.to_stage)}</span>
                      </>
                    ) : (
                      <>Saved as <span className="text-[var(--color-text-primary)]">{STAGE_LABEL(e.to_stage)}</span></>
                    )}
                    {e.note && <span className="text-[var(--color-text-tertiary)]"> — {e.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function STAGE_LABEL(s: string): string {
  return STAGES.find((x) => x.id === s)?.label ?? s;
}

// ─── Kanban view ────────────────────────────────────────────────────────────
//
// Native HTML5 drag-and-drop — no extra dep. Each column is a drop target;
// each card carries the entry id in dataTransfer. On drop, we optimistically
// move the card and fire onChangeStage to persist.

function KanbanBoard({
  byStage,
  busyId,
  onChangeStage,
  onDelete,
  onCoverLetter,
}: {
  byStage: Record<string, PipelineEntry[]>;
  busyId: number | null;
  onChangeStage: (id: number, stage: PipelineStage) => Promise<void> | void;
  onDelete: (id: number) => void;
  onCoverLetter: (jobId: string, jobTitle: string) => void;
}) {
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);

  const onDragStart = (e: React.DragEvent, entry: PipelineEntry) => {
    e.dataTransfer.setData('text/plain', String(entry.id));
    e.dataTransfer.setData('application/x-stage', entry.stage);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stage) setDragOverStage(stage);
  };
  const onDragLeave = () => setDragOverStage(null);
  const onDrop = async (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const fromStage = e.dataTransfer.getData('application/x-stage');
    if (!Number.isFinite(id) || fromStage === stage) return;
    await onChangeStage(id, stage);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {STAGES.map((stage) => {
        const items = byStage[stage.id] || [];
        const active = dragOverStage === stage.id;
        return (
          <section
            key={stage.id}
            onDragOver={(e) => onDragOver(e, stage.id)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, stage.id)}
            className={`flex-shrink-0 w-72 rounded-lg border bg-[var(--color-bg-elevated)] p-3 transition-colors ${
              active
                ? 'border-[var(--color-accent)]'
                : 'border-[var(--color-border-subtle)]'
            }`}
          >
            <div className="flex items-baseline justify-between mb-2 px-1">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {stage.label}
              </span>
              <span className="text-xs text-[var(--color-text-tertiary)]">{items.length}</span>
            </div>
            <div className="flex flex-col gap-2 min-h-12">
              {items.map((entry) => (
                <KanbanCard
                  key={entry.id}
                  entry={entry}
                  busy={busyId === entry.id}
                  onDragStart={(e) => onDragStart(e, entry)}
                  onDelete={() => onDelete(entry.id)}
                  onCoverLetter={() => onCoverLetter(entry.job_id, entry.title)}
                />
              ))}
              {items.length === 0 && (
                <div className="text-xs text-[var(--color-text-tertiary)] text-center py-4">
                  Drop here
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KanbanCard({
  entry,
  busy,
  onDragStart,
  onDelete,
  onCoverLetter,
}: {
  entry: PipelineEntry;
  busy: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDelete: () => void;
  onCoverLetter: () => void;
}) {
  return (
    <div
      draggable={!busy}
      onDragStart={onDragStart}
      className={`rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-2.5 ${
        busy ? 'opacity-50 cursor-wait' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="block text-xs font-medium hover:text-[var(--color-accent)] line-clamp-2"
      >
        {entry.title}
      </a>
      <div className="mt-1 text-[11px] text-[var(--color-text-secondary)] line-clamp-1">
        {entry.company}
        {entry.location && <> · {entry.location}</>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {entry.llm_score !== null && (
          <span className="inline-flex items-center px-1.5 py-0 rounded-md text-[10px]"
            style={{
              background: entry.llm_score >= 70 ? 'rgba(34,197,94,0.15)' : entry.llm_score >= 40 ? 'rgba(234,179,8,0.15)' : 'rgba(120,120,120,0.15)',
              color: entry.llm_score >= 70 ? '#22c55e' : entry.llm_score >= 40 ? '#eab308' : 'var(--color-text-tertiary)',
            }}
          >
            score {entry.llm_score}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onCoverLetter(); }}
            disabled={busy}
            className="text-[11px] px-2 h-6 rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] disabled:opacity-50 cursor-pointer"
            title="Generate cover letter"
          >
            Letter
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={busy}
            className="text-[11px] px-2 h-6 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-danger,#dc2626)] cursor-pointer"
            title="Remove"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

function CoverLetterModal({
  state,
  onClose,
}: {
  state: { jobId: string; jobTitle: string; text: string; loading: boolean; usage?: UsageState; capped?: boolean };
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
            {state.usage && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {state.usage.remaining}/{state.usage.limit} left today
              </span>
            )}
            {!state.loading && state.text && !state.capped && (
              <button onClick={copy} className="text-xs px-3 h-8 rounded-md border border-[var(--color-border-muted)] cursor-pointer">Copy</button>
            )}
            <button onClick={onClose} className="text-xs px-3 h-8 rounded-md cursor-pointer">Close</button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {state.loading ? (
            <p className="text-sm text-[var(--color-text-secondary)]">Generating…</p>
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
