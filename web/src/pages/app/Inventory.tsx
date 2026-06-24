import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth'
import { ThemeToggle } from '../../components/ThemeToggle'
import {
  fetchInventory,
  saveInventory,
  extractInventoryFromResume,
  extractInventoryFromLinkedin,
  importLinkedinExport,
  type Inventory,
  type InvSkill,
} from '../../lib/api'
import { parseResumeFile, parseLinkedinZip } from '../../lib/parse'

const EMPTY: Inventory = {
  skills: [],
  experience: [],
  education: [],
  certifications: [],
  summary: null,
  total_years_experience: null,
  sources: [],
}

export default function InventoryPage() {
  const { user } = useAuthStore()
  const [inv, setInv] = useState<Inventory>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState<null | 'resume' | 'linkedin'>(null)
  const [pasteText, setPasteText] = useState('')

  const resumeRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchInventory()
      .then((i) => !cancelled && setInv(i))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load inventory'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (label: string, fn: () => Promise<Inventory>, ok: string) => {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      setInv(await fn())
      setNotice(ok)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const onResumeFile = async (file: File) => {
    setBusy('parsing résumé…')
    setError(null)
    setNotice(null)
    try {
      const text = await parseResumeFile(file)
      if (text.trim().length < 80) throw new Error('Could not read enough text from that file.')
      setInv(await extractInventoryFromResume(text))
      setNotice('Résumé parsed and merged into your inventory.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Résumé import failed')
    } finally {
      setBusy(null)
      if (resumeRef.current) resumeRef.current.value = ''
    }
  }

  const onZipFile = async (file: File) => {
    setBusy('reading LinkedIn export…')
    setError(null)
    setNotice(null)
    try {
      const payload = await parseLinkedinZip(file)
      const total =
        payload.skills.length + payload.positions.length + payload.education.length + payload.certifications.length
      if (total === 0) throw new Error('No recognizable LinkedIn CSVs found in that ZIP.')
      setInv(await importLinkedinExport(payload))
      setNotice(`Imported ${payload.skills.length} skills and ${payload.positions.length} roles from LinkedIn.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LinkedIn import failed')
    } finally {
      setBusy(null)
      if (zipRef.current) zipRef.current.value = ''
    }
  }

  const submitPaste = () => {
    if (pasteOpen === 'resume') {
      run('extracting…', () => extractInventoryFromResume(pasteText), 'Résumé text extracted and merged.')
    } else if (pasteOpen === 'linkedin') {
      run('extracting…', () => extractInventoryFromLinkedin(pasteText), 'LinkedIn text extracted and merged.')
    }
    setPasteOpen(null)
    setPasteText('')
  }

  const removeSkill = (name: string) =>
    run('saving…', () => saveInventory({ skills: inv.skills.filter((s) => s.name !== name) }), 'Removed.')

  const updateSkill = (idx: number, patch: Partial<InvSkill>) => {
    const next = inv.skills.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    setInv({ ...inv, skills: next })
  }

  const persistSkills = () => run('saving…', () => saveInventory({ skills: inv.skills }), 'Saved.')

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link to="/app" className="text-sm font-medium tracking-tight shrink-0">Reverse ATS</Link>
          <div className="flex items-center gap-3 sm:gap-4 text-xs text-[var(--color-text-secondary)] min-w-0">
            <Link to="/app/profile" className="hover:text-[var(--color-text-primary)] whitespace-nowrap">Profile</Link>
            <Link to="/app" className="hover:text-[var(--color-text-primary)] whitespace-nowrap">Back to app</Link>
            <span className="hidden md:inline truncate max-w-[180px]">{user?.email}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Skills &amp; Experience</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Build a structured inventory from your résumé and LinkedIn. It powers the 1-to-1 match
            (strengths vs. gaps) on every job and the tailored résumé / cover letter.
          </p>
        </div>

        {/* Import actions */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <ImportCard
            title="From your résumé"
            hint="Upload a PDF / DOCX, or paste the text. We extract skills, roles, and dates."
          >
            <input
              ref={resumeRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onResumeFile(e.target.files[0])}
            />
            <ActionBtn onClick={() => resumeRef.current?.click()} disabled={!!busy}>Upload résumé</ActionBtn>
            <ActionBtn variant="ghost" onClick={() => { setPasteOpen('resume'); setPasteText('') }} disabled={!!busy}>
              Paste text
            </ActionBtn>
          </ImportCard>

          <ImportCard
            title="From LinkedIn"
            hint='Settings → "Get a copy of your data" → upload the ZIP. Or paste your About + Experience.'
          >
            <input
              ref={zipRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onZipFile(e.target.files[0])}
            />
            <ActionBtn onClick={() => zipRef.current?.click()} disabled={!!busy}>Upload export ZIP</ActionBtn>
            <ActionBtn variant="ghost" onClick={() => { setPasteOpen('linkedin'); setPasteText('') }} disabled={!!busy}>
              Paste text
            </ActionBtn>
          </ImportCard>
        </div>

        {busy && <Banner tone="info">{busy}</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone="ok">{notice}</Banner>}

        {pasteOpen && (
          <div className="mb-8 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-elevated)] p-4">
            <p className="text-sm font-medium mb-2">
              Paste your {pasteOpen === 'resume' ? 'résumé' : 'LinkedIn profile (About + Experience + Skills)'}
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 text-xs font-mono rounded-md bg-[var(--color-bg-base)] border border-[var(--color-border-muted)] focus:border-[var(--color-accent)] focus:outline-none resize-y"
              placeholder="Paste here…"
            />
            <div className="mt-3 flex gap-2">
              <ActionBtn onClick={submitPaste} disabled={pasteText.trim().length < 80}>Extract</ActionBtn>
              <ActionBtn variant="ghost" onClick={() => setPasteOpen(null)}>Cancel</ActionBtn>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
        ) : inv.skills.length === 0 && inv.experience.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No inventory yet — import from your résumé or LinkedIn above to get started.
          </p>
        ) : (
          <div className="flex flex-col gap-10">
            {inv.summary && (
              <section>
                <SectionTitle>Summary</SectionTitle>
                <p className="text-sm text-[var(--color-text-secondary)]">{inv.summary}</p>
              </section>
            )}

            <section>
              <div className="flex items-center justify-between">
                <SectionTitle>
                  Skills <span className="text-[var(--color-text-secondary)] font-normal">({inv.skills.length})</span>
                </SectionTitle>
                <button onClick={persistSkills} disabled={!!busy} className="text-xs text-[var(--color-accent)] hover:underline">
                  Save edits
                </button>
              </div>
              <div className="mt-3 grid sm:grid-cols-2 gap-2">
                {inv.skills.map((s, i) => (
                  <div key={s.name + i} className="flex items-center gap-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-elevated)] px-3 py-2">
                    <span className="text-sm flex-1 truncate">{s.name}</span>
                    {s.source.includes('linkedin') && s.source.includes('resume') ? (
                      <Tag>both</Tag>
                    ) : s.source.includes('linkedin') ? (
                      <Tag>in</Tag>
                    ) : null}
                    <select
                      value={s.proficiency ?? ''}
                      onChange={(e) => updateSkill(i, { proficiency: e.target.value ? Number(e.target.value) : null })}
                      className="text-xs bg-transparent border border-[var(--color-border-muted)] rounded px-1 py-0.5"
                      title="Proficiency 1–5"
                    >
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <input
                      type="number"
                      value={s.years ?? ''}
                      onChange={(e) => updateSkill(i, { years: e.target.value ? Number(e.target.value) : null })}
                      placeholder="yrs"
                      className="w-12 text-xs bg-transparent border border-[var(--color-border-muted)] rounded px-1 py-0.5"
                      title="Years"
                    />
                    <button onClick={() => removeSkill(s.name)} className="text-xs text-[var(--color-text-secondary)] hover:text-red-500" title="Remove">✕</button>
                  </div>
                ))}
              </div>
            </section>

            {inv.experience.length > 0 && (
              <section>
                <SectionTitle>Experience</SectionTitle>
                <div className="mt-3 flex flex-col gap-4">
                  {inv.experience.map((e, i) => (
                    <div key={i} className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-elevated)] p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{e.title || '—'}{e.company ? ` · ${e.company}` : ''}</p>
                        <p className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                          {[e.start, e.end || 'Present'].filter(Boolean).join(' – ')}
                        </p>
                      </div>
                      {e.location && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{e.location}</p>}
                      {e.highlights.length > 0 && (
                        <ul className="mt-2 list-disc list-inside text-xs text-[var(--color-text-secondary)] space-y-1">
                          {e.highlights.map((h, j) => <li key={j}>{h}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {inv.education.length > 0 && (
              <section>
                <SectionTitle>Education</SectionTitle>
                <ul className="mt-3 text-sm text-[var(--color-text-secondary)] space-y-1">
                  {inv.education.map((e, i) => (
                    <li key={i}>{[e.degree, e.field].filter(Boolean).join(' ')} — {e.school} {e.end ? `(${e.end})` : ''}</li>
                  ))}
                </ul>
              </section>
            )}

            {inv.certifications.length > 0 && (
              <section>
                <SectionTitle>Certifications</SectionTitle>
                <ul className="mt-3 text-sm text-[var(--color-text-secondary)] space-y-1">
                  {inv.certifications.map((c, i) => (
                    <li key={i}>{c.name}{c.issuer ? ` — ${c.issuer}` : ''}{c.date ? ` (${c.date})` : ''}</li>
                  ))}
                </ul>
              </section>
            )}

            {inv.sources.length > 0 && (
              <p className="text-xs text-[var(--color-text-secondary)]">
                Sources: {inv.sources.join(', ')}. Edits override imports.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function ImportCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-elevated)] p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{hint}</p>
      <div className="mt-3 flex gap-2">{children}</div>
    </div>
  )
}

function ActionBtn({
  children,
  onClick,
  disabled,
  variant = 'solid',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'solid' | 'ghost'
}) {
  const base = 'text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50'
  const cls =
    variant === 'solid'
      ? `${base} bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]`
      : `${base} border border-[var(--color-border-muted)] hover:border-[var(--color-accent)]`
  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-bg-base)] border border-[var(--color-border-muted)] text-[var(--color-text-secondary)]">
      {children}
    </span>
  )
}

function Banner({ tone, children }: { tone: 'info' | 'error' | 'ok'; children: React.ReactNode }) {
  const map = {
    info: 'border-[var(--color-border-muted)] text-[var(--color-text-secondary)]',
    error: 'border-red-500/40 text-red-500',
    ok: 'border-green-500/40 text-green-600',
  }
  return <div className={`mb-6 rounded-md border ${map[tone]} px-4 py-2 text-sm`}>{children}</div>
}
