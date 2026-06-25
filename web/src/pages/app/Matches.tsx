import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth'
import { ThemeToggle } from '../../components/ThemeToggle'
import {
  fetchDailyMatches,
  runDailyMatches,
  generateTailoredResume,
  generateCoverLetter,
  saveJob,
  type DailyMatch,
} from '../../lib/api'
import { downloadResumeDocx, downloadCoverLetterDocx } from '../../lib/docx'

export default function MatchesPage() {
  const { user } = useAuthStore()
  const [date, setDate] = useState<string | null>(null)
  const [matches, setMatches] = useState<DailyMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // `${jobId}:${kind}`

  useEffect(() => {
    fetchDailyMatches()
      .then((r) => { setDate(r.date); setMatches(r.matches) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load matches'))
      .finally(() => setLoading(false))
  }, [])

  const refresh = async () => {
    setRunning(true); setError(null)
    try {
      const r = await runDailyMatches()
      setDate(r.date); setMatches(r.matches)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not compute matches')
    } finally {
      setRunning(false)
    }
  }

  const tailorResume = async (m: DailyMatch) => {
    setBusy(`${m.job_id}:resume`); setError(null)
    try {
      const r = await generateTailoredResume(m.job_id)
      await downloadResumeDocx(r.resume, { contact: user?.email ?? undefined, jobTitle: m.title, company: m.company })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Résumé generation failed')
    } finally { setBusy(null) }
  }

  const coverLetter = async (m: DailyMatch) => {
    setBusy(`${m.job_id}:cover`); setError(null)
    try {
      const r = await generateCoverLetter(m.job_id, 'standard')
      await downloadCoverLetterDocx(r.cover_letter, { contact: user?.email ?? undefined, jobTitle: m.title, company: m.company })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cover letter generation failed')
    } finally { setBusy(null) }
  }

  const save = async (m: DailyMatch) => {
    setBusy(`${m.job_id}:save`)
    try { await saveJob(m.job_id) } catch { /* ignore */ } finally { setBusy(null) }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link to="/app" className="text-sm font-medium tracking-tight shrink-0">Reverse ATS</Link>
          <div className="flex items-center gap-3 sm:gap-4 text-xs text-[var(--color-text-secondary)] min-w-0">
            <Link to="/app/inventory" className="hover:text-[var(--color-text-primary)] whitespace-nowrap">Skills &amp; experience</Link>
            <Link to="/app/feed" className="hover:text-[var(--color-text-primary)] whitespace-nowrap">Feed</Link>
            <span className="hidden md:inline truncate max-w-[180px]">{user?.email}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Daily Matches</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Your best-fit roles, ranked against your inventory and emailed each morning.
              {date && <span className="ml-1">Latest: {date}.</span>}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={running}
            className="shrink-0 text-xs px-3 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg,white)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 cursor-pointer"
          >
            {running ? 'Computing…' : 'Refresh matches now'}
          </button>
        </div>

        {error && <div className="mb-4 text-xs text-[var(--color-danger,#dc2626)]">{error}</div>}

        {loading ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
        ) : matches.length === 0 ? (
          <div className="text-sm text-[var(--color-text-secondary)] py-8">
            No matches yet. Make sure your <Link to="/app/inventory" className="text-[var(--color-accent)] hover:underline">Skills &amp; Experience</Link> inventory is built, then click <strong>Refresh matches now</strong>.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {matches.map((m) => (
              <div key={m.job_id} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-[var(--color-text-tertiary)]">#{m.rank}</span>
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-[var(--color-accent)] truncate">{m.title}</a>
                      <span className="text-xs px-2 py-0.5 rounded-md font-semibold" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                        {m.fit_score}% fit · {m.coverage_pct}% skills
                      </span>
                      {(m.workplace_type || m.remote) && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md uppercase tracking-wide font-semibold" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                          {m.workplace_type || 'Remote'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {m.company}{m.location && <> · {m.location}</>}{m.category && <> · {m.category}</>}
                    </div>
                    {m.strengths.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="text-[11px] font-semibold text-[#22c55e]">Strengths</span>
                        {m.strengths.map((s) => <span key={s} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>{s}</span>)}
                      </div>
                    )}
                    {m.gaps.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[11px] font-semibold text-[#eab308]">Gaps</span>
                        {m.gaps.map((g) => <span key={g} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.12)', color: '#eab308' }}>{g}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => tailorResume(m)} disabled={!!busy} className="text-xs px-3 h-7 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg,white)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 cursor-pointer">
                      {busy === `${m.job_id}:resume` ? '…' : 'Tailor résumé'}
                    </button>
                    <button onClick={() => coverLetter(m)} disabled={!!busy} className="text-xs px-3 h-7 rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] disabled:opacity-50 cursor-pointer">
                      {busy === `${m.job_id}:cover` ? '…' : 'Cover letter'}
                    </button>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 h-7 leading-7 text-center rounded-md border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-tinted,rgba(120,120,120,0.08))] cursor-pointer">
                      Apply →
                    </a>
                    <button onClick={() => save(m)} disabled={!!busy} className="text-xs px-3 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer">
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
              "Tailor résumé" / "Cover letter" download a job-specific .docx built from your inventory. "Apply" opens the posting.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
