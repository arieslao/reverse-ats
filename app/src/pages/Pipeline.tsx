import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPipeline,
  updatePipelineEntry,
  deletePipelineEntry,
  generateCoverLetter,
} from '../lib/api'
import type { PipelineEntry, PipelineStage } from '../lib/types'
import { StageTag, STAGE_CONFIG } from '../components/StageTag'
import { ScoreBadge } from '../components/ScoreBadge'

const STAGES: PipelineStage[] = [
  'saved',
  'applied',
  'phone_screen',
  'technical',
  'final',
  'offer',
  'rejected',
  'withdrawn',
]

const ARCHIVE_STAGES: PipelineStage[] = ['rejected', 'withdrawn']

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Drag Handle Icon ────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '2px 4px',
        opacity: 0.3,
        flexShrink: 0,
        cursor: 'grab',
      }}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: 'flex', gap: 3 }}>
          <div style={{ width: 2, height: 2, borderRadius: '50%', background: '#a1a1aa' }} />
          <div style={{ width: 2, height: 2, borderRadius: '50%', background: '#a1a1aa' }} />
        </div>
      ))}
    </div>
  )
}

// ─── Cover Letter Panel ──────────────────────────────────────────────────────
function CoverLetterPanel({
  text,
  onCopy,
}: {
  text: string
  onCopy: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy()
  }

  return (
    <div
      style={{
        marginTop: 10,
        background: 'rgba(139, 92, 246, 0.06)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: 6,
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Cover Letter
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)',
            border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.3)'}`,
            borderRadius: 4,
            color: copied ? '#22c55e' : '#a78bfa',
            fontSize: 11,
            fontWeight: 500,
            padding: '3px 10px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#d4d4d8',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          maxHeight: 280,
          overflowY: 'auto',
        }}
      >
        {text}
      </div>
    </div>
  )
}

// ─── Entry Card ──────────────────────────────────────────────────────────────
interface EntryCardProps {
  entry: PipelineEntry
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onArchive: () => void
}

function EntryCard({ entry, isDragging, onDragStart, onDragEnd, onArchive }: EntryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showCoverLetter, setShowCoverLetter] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [form, setForm] = useState({
    stage: entry.stage,
    notes: entry.notes || '',
    contact_name: entry.contact_name || '',
    contact_email: entry.contact_email || '',
    contact_role: entry.contact_role || '',
    next_step: entry.next_step || '',
    next_step_date: entry.next_step_date || '',
    salary_offered: entry.salary_offered ? String(entry.salary_offered) : '',
  })
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => updatePipelineEntry(entry.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      setExpanded(false)
    },
  })

  const company = entry.company || entry.job?.company || '—'
  const title = entry.title || entry.job?.title || '—'
  const location = entry.location || entry.job?.location || null
  const score = entry.llm_score ?? entry.keyword_score ?? entry.job?.llm_score ?? entry.job?.keyword_score ?? null
  const appliedDays = daysSince(entry.applied_at)
  const stageColor = STAGE_CONFIG[entry.stage]?.color || '#52525b'
  const coverLetter = entry.cover_letter || null
  const notesPreview = entry.notes ? entry.notes.slice(0, 40) + (entry.notes.length > 40 ? '…' : '') : null
  const url = entry.url || entry.job?.url

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      stage: form.stage,
      notes: form.notes || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_role: form.contact_role || null,
      next_step: form.next_step || null,
      next_step_date: form.next_step_date || null,
      salary_offered: form.salary_offered ? Number(form.salary_offered) : null,
    }
    updateMut.mutate(payload)
  }

  const handleGenerateCoverLetter = async () => {
    if (!entry.job_id) return
    setGenLoading(true)
    setGenError(null)
    try {
      await generateCoverLetter(entry.job_id)
      await queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    } catch {
      setGenError('Failed to generate cover letter')
    } finally {
      setGenLoading(false)
    }
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        onDragStart(e)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !showArchiveConfirm && setExpanded((v) => !v)}
      style={{
        background: isDragging ? '#242736' : '#1a1d27',
        border: `1px solid ${hovered && !isDragging ? stageColor + '44' : '#2e3140'}`,
        borderLeft: `3px solid ${stageColor}`,
        borderRadius: 8,
        padding: '12px 12px 12px 10px',
        marginBottom: 8,
        cursor: isDragging ? 'grabbing' : 'pointer',
        opacity: isDragging ? 0.5 : 1,
        transition: 'border-color 0.15s, opacity 0.15s',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Card top row: drag handle + content + score + archive button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <DragHandle />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Company */}
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: '#f4f4f5',
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}
          >
            {company}
          </div>

          {/* Title — max 3 lines */}
          <div
            style={{
              fontSize: 13,
              color: '#d4d4d8',
              marginTop: 3,
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </div>

          {/* Location */}
          {location && (
            <div style={{ fontSize: 11, color: '#71717a', marginTop: 4, wordBreak: 'break-word', lineHeight: 1.3 }}>
              {location}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <ScoreBadge score={score as number | null} size="sm" />

          {/* Archive X button — visible on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowArchiveConfirm(true)
            }}
            title="Archive application"
            style={{
              background: 'none',
              border: 'none',
              color: hovered ? '#71717a' : 'transparent',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: '0 2px',
              transition: 'color 0.15s',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Cover letter indicator */}
      {coverLetter && (
        <div style={{ marginTop: 5 }}>
          <span
            style={{
              display: 'inline-block',
              background: 'rgba(139,92,246,0.15)',
              color: '#a78bfa',
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 3,
              padding: '1px 5px',
              letterSpacing: '0.03em',
            }}
          >
            COVER LETTER
          </span>
        </div>
      )}

      {/* Notes preview */}
      {notesPreview && !expanded && (
        <div style={{ fontSize: 12, color: '#71717a', marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
          {notesPreview}
        </div>
      )}

      {/* Meta row: days ago, next step */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 8,
          alignItems: 'center',
          fontSize: 11,
          color: '#52525b',
          flexWrap: 'wrap',
        }}
      >
        {entry.applied_at && (
          <span>Applied {formatDate(entry.applied_at)}</span>
        )}
        {appliedDays !== null && !entry.applied_at && (
          <span>{appliedDays}d ago</span>
        )}
        {entry.next_step_date && (
          <span style={{ color: '#f59e0b' }}>
            Next: {formatDate(entry.next_step_date)}
          </span>
        )}
      </div>

      {/* Archive confirmation */}
      {showArchiveConfirm && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 5,
          }}
        >
          <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 7 }}>
            Archive this application?
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => {
                setShowArchiveConfirm(false)
                onArchive()
              }}
              style={{
                background: 'rgba(239,68,68,0.2)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 4,
                color: '#f87171',
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              Archive
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowArchiveConfirm(false)
              }}
              style={{
                background: 'none',
                border: '1px solid #2e3140',
                borderRadius: 4,
                color: '#71717a',
                fontSize: 11,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Expanded form */}
      {expanded && !showArchiveConfirm && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <Field label="Move to Stage">
              <select
                value={form.stage}
                onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as PipelineStage }))}
                style={selectStyle}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_CONFIG[s].label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Salary Offered">
              <input
                type="number"
                placeholder="e.g. 150000"
                value={form.salary_offered}
                onChange={(e) => setForm((f) => ({ ...f, salary_offered: e.target.value }))}
                style={inputStyle}
              />
            </Field>

            <Field label="Contact Name">
              <input
                type="text"
                placeholder="Recruiter name"
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                style={inputStyle}
              />
            </Field>

            <Field label="Contact Email">
              <input
                type="email"
                placeholder="email@company.com"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                style={inputStyle}
              />
            </Field>

            <Field label="Contact Role">
              <input
                type="text"
                placeholder="e.g. Recruiter"
                value={form.contact_role}
                onChange={(e) => setForm((f) => ({ ...f, contact_role: e.target.value }))}
                style={inputStyle}
              />
            </Field>

            <Field label="Next Step Date">
              <input
                type="date"
                value={form.next_step_date}
                onChange={(e) => setForm((f) => ({ ...f, next_step_date: e.target.value }))}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Next Step">
            <input
              type="text"
              placeholder="e.g. Technical interview scheduled"
              value={form.next_step}
              onChange={(e) => setForm((f) => ({ ...f, next_step: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }}
            />
          </Field>

          <div style={{ marginTop: 8 }}>
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Interview notes, observations..."
                style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
              />
            </Field>
          </div>

          {/* Cover letter section */}
          {coverLetter ? (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setShowCoverLetter((v) => !v)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(139,92,246,0.3)',
                  borderRadius: 4,
                  color: '#a78bfa',
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  marginBottom: showCoverLetter ? 0 : undefined,
                }}
              >
                {showCoverLetter ? 'Hide Cover Letter' : 'View Cover Letter'}
              </button>
              {showCoverLetter && (
                <CoverLetterPanel text={coverLetter} onCopy={() => {}} />
              )}
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={handleGenerateCoverLetter}
                disabled={genLoading}
                style={{
                  background: genLoading ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.15)',
                  border: '1px solid rgba(139,92,246,0.3)',
                  borderRadius: 4,
                  color: '#a78bfa',
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 12px',
                  cursor: genLoading ? 'not-allowed' : 'pointer',
                  opacity: genLoading ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {genLoading ? 'Generating…' : '✦ Generate Cover Letter'}
              </button>
              {genError && (
                <span style={{ fontSize: 11, color: '#f87171', marginLeft: 8 }}>{genError}</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              style={{
                background: '#3b82f6',
                border: 'none',
                borderRadius: 5,
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                padding: '6px 14px',
                cursor: updateMut.isPending ? 'not-allowed' : 'pointer',
                opacity: updateMut.isPending ? 0.7 : 1,
              }}
            >
              {updateMut.isPending ? 'Saving…' : 'Save Changes'}
            </button>

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}
                onClick={(e) => e.stopPropagation()}
              >
                View Posting ↗
              </a>
            )}

            {updateMut.isError && (
              <span style={{ fontSize: 11, color: '#ef4444' }}>Save failed</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Field wrapper ───────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          fontSize: 10,
          color: '#52525b',
          display: 'block',
          marginBottom: 3,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#0f1117',
  border: '1px solid #2e3140',
  borderRadius: 4,
  color: '#e4e4e7',
  fontSize: 12,
  padding: '5px 8px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

// ─── Pipeline (main page) ────────────────────────────────────────────────────
export function Pipeline() {
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null)

  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pipeline'],
    queryFn: fetchPipeline,
  })

  // Move card to new stage
  const moveMut = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: PipelineStage }) =>
      updatePipelineEntry(id, { stage }),
    onMutate: async ({ id, stage }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['pipeline'] })
      const prev = queryClient.getQueryData(['pipeline'])
      queryClient.setQueryData(['pipeline'], (old: typeof data) => {
        if (!old) return old
        const updatedItems = old.items.map((item) =>
          item.id === id ? { ...item, stage } : item,
        )
        const byStage: Record<string, PipelineEntry[]> = {}
        for (const s of STAGES) {
          byStage[s] = updatedItems.filter((item) => item.stage === s)
        }
        return { items: updatedItems, by_stage: byStage }
      })
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['pipeline'], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    },
  })

  // Delete (archive) a single entry
  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePipelineEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    },
  })

  // Clear all entries for a stage
  const clearStageMut = useMutation({
    mutationFn: async (stage: PipelineStage) => {
      const entries: PipelineEntry[] = data?.by_stage[stage] || []
      await Promise.all(entries.map((e) => deletePipelineEntry(e.id)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    },
  })

  const byStage = data?.by_stage || {}
  const total = data?.items.length || 0
  const activeCount = (data?.items || []).filter(
    (e) => !['rejected', 'withdrawn', 'offer'].includes(e.stage),
  ).length

  return (
    <div
      style={{
        padding: '24px',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: '#e4e4e7',
            letterSpacing: '-0.02em',
          }}
        >
          Pipeline
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#71717a' }}>
          {total} total &middot; {activeCount} active
        </p>
      </div>

      {isLoading && (
        <div style={{ color: '#52525b', textAlign: 'center', marginTop: 48 }}>
          Loading pipeline…
        </div>
      )}

      {isError && (
        <div
          style={{
            color: '#f87171',
            padding: 16,
            background: 'rgba(239,68,68,0.1)',
            borderRadius: 8,
          }}
        >
          Failed to load pipeline data.
        </div>
      )}

      {!isLoading && !isError && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            overflow: 'auto',
            flex: 1,
            paddingBottom: 8,
          }}
        >
          {STAGES.map((stage) => {
            const entries: PipelineEntry[] = byStage[stage] || []
            const isDragTarget = dragOverStage === stage
            const isArchiveCol = ARCHIVE_STAGES.includes(stage)
            const stageColor = STAGE_CONFIG[stage]?.color || '#52525b'

            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverStage(stage)
                }}
                onDragLeave={(e) => {
                  // Only clear if leaving the column (not entering a child)
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStage(null)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggedId !== null && dragOverStage !== null) {
                    moveMut.mutate({ id: draggedId, stage: dragOverStage })
                  }
                  setDraggedId(null)
                  setDragOverStage(null)
                }}
                style={{
                  flexShrink: 0,
                  width: 280,
                  background: isDragTarget ? 'rgba(59,130,246,0.04)' : '#111318',
                  border: `1px solid ${isDragTarget ? '#3b82f6' : '#1e2030'}`,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '100%',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Column header */}
                <div
                  style={{
                    padding: '10px 12px',
                    borderBottom: `1px solid ${isDragTarget ? 'rgba(59,130,246,0.2)' : '#1e2030'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                    gap: 6,
                  }}
                >
                  <StageTag stage={stage} size="sm" />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Clear All button for archive-type columns */}
                    {isArchiveCol && entries.length > 0 && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Clear all ${entries.length} ${STAGE_CONFIG[stage].label} entries?`)) {
                            clearStageMut.mutate(stage)
                          }
                        }}
                        disabled={clearStageMut.isPending}
                        title={`Clear all ${STAGE_CONFIG[stage].label}`}
                        style={{
                          background: 'none',
                          border: `1px solid ${stageColor}33`,
                          borderRadius: 4,
                          color: stageColor,
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 6px',
                          cursor: clearStageMut.isPending ? 'not-allowed' : 'pointer',
                          opacity: clearStageMut.isPending ? 0.5 : 0.8,
                          letterSpacing: '0.03em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Clear All
                      </button>
                    )}

                    <span
                      style={{
                        background: '#242736',
                        color: '#71717a',
                        borderRadius: 10,
                        padding: '1px 7px',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {entries.length}
                    </span>
                  </div>
                </div>

                {/* Drop zone indicator strip */}
                {isDragTarget && (
                  <div
                    style={{
                      height: 2,
                      background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)',
                      flexShrink: 0,
                    }}
                  />
                )}

                {/* Cards */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '8px',
                    minHeight: 60,
                  }}
                >
                  {entries.length === 0 && (
                    <div
                      style={{
                        padding: '20px 0',
                        textAlign: 'center',
                        fontSize: 12,
                        color: isDragTarget ? '#3b82f6' : '#3f3f46',
                        borderRadius: 6,
                        border: `1px dashed ${isDragTarget ? '#3b82f650' : '#1e2030'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      {isDragTarget ? 'Drop here' : 'Empty'}
                    </div>
                  )}
                  {entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      isDragging={draggedId === entry.id}
                      onDragStart={(e) => {
                        setDraggedId(entry.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        setDraggedId(null)
                        setDragOverStage(null)
                      }}
                      onArchive={() => deleteMut.mutate(entry.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
