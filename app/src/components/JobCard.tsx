import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Job } from '../lib/types'
import { dismissJob, saveJob, generateCoverLetter, downloadTailoredResume, downloadCoverLetterDocx, emailJobDocs } from '../lib/api'
import { ScoreBadge } from './ScoreBadge'

interface JobCardProps {
  job: Job
}

function cleanDescription(html: string): string {
  if (!html) return ''
  // Decode HTML entities and strip tags via DOMParser
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let text = doc.body.textContent || ''
  // Normalize whitespace
  text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim()
  return text
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return hours <= 0 ? 'just now' : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

/** Format a single annual amount: $211400 → "$211K", $1_500_000 → "$1.5M". */
function formatAmount(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

/** Display string for a job's compensation, or null when nothing's disclosed.
 *  Prefers the employer's own `comp_summary` (Ashby publishes a polished
 *  string with equity / commission notes); falls back to formatting our
 *  parsed min/max range otherwise. */
function formatSalary(job: Job): string | null {
  if (job.comp_summary && job.comp_summary.trim()) return job.comp_summary.trim()
  if (job.salary_min == null && job.salary_max == null) return null
  const lo = job.salary_min
  const hi = job.salary_max
  if (lo != null && hi != null) {
    const suffix = job.salary_currency && job.salary_currency !== 'USD' ? ` ${job.salary_currency}` : ''
    return `${formatAmount(lo)} – ${formatAmount(hi)}${suffix}`
  }
  return formatAmount((lo ?? hi) as number)
}

export function JobCard({ job }: JobCardProps) {
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()

  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [coverLetterLoading, setCoverLetterLoading] = useState(false)
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [docBusy, setDocBusy] = useState<'' | 'resume' | 'cover' | 'email'>('')
  const [docError, setDocError] = useState<string | null>(null)
  const [docOk, setDocOk] = useState<string | null>(null)

  const handleDownload = async (kind: 'resume' | 'cover') => {
    setDocBusy(kind)
    setDocError(null)
    setDocOk(null)
    try {
      await (kind === 'resume' ? downloadTailoredResume(job.id) : downloadCoverLetterDocx(job.id))
    } catch (e) {
      setDocError((e as Error).message)
    } finally {
      setDocBusy('')
    }
  }

  const handleEmail = async () => {
    setDocBusy('email')
    setDocError(null)
    setDocOk(null)
    try {
      const r = await emailJobDocs(job.id)
      setDocOk(`Emailed to ${r.to} (${r.attached.length} file${r.attached.length === 1 ? '' : 's'})`)
    } catch (e) {
      setDocError((e as Error).message)
    } finally {
      setDocBusy('')
    }
  }

  const dismissMut = useMutation({
    mutationFn: () => dismissJob(job.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })

  const saveMut = useMutation({
    mutationFn: () => saveJob(job.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    },
  })

  const handleGenerateCoverLetter = async () => {
    setCoverLetterLoading(true)
    setCoverLetterError(null)
    setCoverLetter(null)
    try {
      const result = await generateCoverLetter(job.id)
      if (result.error) {
        setCoverLetterError(result.error)
      } else {
        setCoverLetter(result.cover_letter)
      }
    } catch (e) {
      setCoverLetterError((e as Error).message)
    } finally {
      setCoverLetterLoading(false)
    }
  }

  const handleCopy = () => {
    if (coverLetter) {
      navigator.clipboard.writeText(coverLetter)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const score = job.llm_score ?? job.keyword_score

  return (
    <div
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-muted)',
        borderRadius: 8,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        opacity: job.expired ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-accent)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-muted)'
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{job.company}</span>
            {/* Workplace badge — prefers Ashby/Lever workplace_type (Remote /
                Hybrid / OnSite) for finer granularity; falls back to the
                legacy boolean for ATSes that don't expose the field. */}
            {(job.workplace_type || job.remote) && (
              <span
                style={{
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: 'var(--color-success)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {job.workplace_type || 'Remote'}
              </span>
            )}
            {job.expired && (
              <span
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--color-danger)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Expired
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#c4c4cc', marginTop: 2 }}>{job.title}</div>
          {(job as any).department && (
            <div style={{ marginTop: 3 }}>
              <span
                style={{
                  background: 'rgba(161, 161, 170, 0.08)',
                  border: '1px solid var(--color-border-muted)',
                  color: 'var(--color-text-tertiary)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontSize: 11,
                }}
              >
                {(job as any).department}
              </span>
            </div>
          )}
          {job.location && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{job.location}</div>
          )}
        </div>

        {/* Score + meta */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <ScoreBadge score={score} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{timeAgo(job.first_seen_at)}</span>
        </div>
      </div>

      {/* Tags row */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {(() => {
          const sal = formatSalary(job)
          return sal ? (
            <span
              title={
                job.salary_min != null && job.salary_max != null
                  ? `${job.salary_min.toLocaleString()} – ${job.salary_max.toLocaleString()} ${job.salary_currency || 'USD'} / year`
                  : undefined
              }
              style={{
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.28)',
                color: 'var(--color-success)',
                borderRadius: 4,
                padding: '1px 8px',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {sal}
            </span>
          ) : null
        })()}
        {job.employment_type && job.employment_type !== 'FullTime' && (
          <span
            style={{
              background: 'rgba(168, 85, 247, 0.12)',
              border: '1px solid rgba(168, 85, 247, 0.28)',
              color: '#c084fc',
              borderRadius: 4,
              padding: '1px 8px',
              fontSize: 11,
            }}
          >
            {job.employment_type}
          </span>
        )}
        {job.category && (
          <span
            style={{
              background: 'var(--color-bg-tinted)',
              border: '1px solid var(--color-border-muted)',
              color: 'var(--color-text-secondary)',
              borderRadius: 4,
              padding: '1px 8px',
              fontSize: 11,
            }}
          >
            {job.category}
          </span>
        )}
        {job.ats_type && (
          <span
            style={{
              background: 'var(--color-bg-tinted)',
              border: '1px solid var(--color-border-muted)',
              color: 'var(--color-text-tertiary)',
              borderRadius: 4,
              padding: '1px 8px',
              fontSize: 11,
            }}
          >
            {job.ats_type}
          </span>
        )}
        {job.pipeline_stage && (
          <span
            style={{
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#60a5fa',
              borderRadius: 4,
              padding: '1px 8px',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            In Pipeline
          </span>
        )}
      </div>

      {/* Expanded: description + actions */}
      {expanded && (
        <div onClick={(e) => e.stopPropagation()}>
          {job.description_snippet && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: 'var(--color-bg-base)',
                borderRadius: 6,
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {cleanDescription(job.description_snippet)}
            </div>
          )}

          {job.llm_reasoning && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--color-accent)',
                lineHeight: 1.5,
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>AI Reasoning: </span>
              {job.llm_reasoning}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-bg-elevated)',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              Apply
            </a>

            {!job.pipeline_stage && (
              <button
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate()}
                style={{
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  color: 'var(--color-success)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  opacity: saveMut.isPending ? 0.6 : 1,
                }}
              >
                {saveMut.isPending ? 'Saving...' : 'Save'}
              </button>
            )}

            <button
              disabled={coverLetterLoading}
              onClick={handleGenerateCoverLetter}
              style={{
                background: 'rgba(168, 85, 247, 0.12)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                color: '#a855f7',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                opacity: coverLetterLoading ? 0.6 : 1,
              }}
            >
              {coverLetterLoading ? 'Generating...' : 'Draft Cover Letter'}
            </button>

            <button
              disabled={docBusy !== ''}
              onClick={() => handleDownload('resume')}
              title="Generate a résumé tailored to this job and download as .docx"
              style={{
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                color: 'var(--color-accent)',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                opacity: docBusy ? 0.6 : 1,
              }}
            >
              {docBusy === 'resume' ? 'Tailoring…' : '📄 Tailored Résumé (.docx)'}
            </button>

            <button
              disabled={docBusy !== ''}
              onClick={() => handleDownload('cover')}
              title="Generate the cover letter and download as .docx"
              style={{
                background: 'rgba(168, 85, 247, 0.10)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                color: '#a855f7',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                opacity: docBusy ? 0.6 : 1,
              }}
            >
              {docBusy === 'cover' ? 'Writing…' : '✉️ Cover Letter (.docx)'}
            </button>

            <button
              disabled={docBusy !== ''}
              onClick={handleEmail}
              title="Generate résumé + cover letter and email them to you as .docx attachments"
              style={{
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.35)',
                color: 'var(--color-success)',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: docBusy ? 0.6 : 1,
              }}
            >
              {docBusy === 'email' ? 'Emailing…' : '📧 Email résumé + cover letter'}
            </button>

            {!job.dismissed && (
              <button
                disabled={dismissMut.isPending}
                onClick={() => dismissMut.mutate()}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border-muted)',
                  color: 'var(--color-text-tertiary)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  opacity: dismissMut.isPending ? 0.6 : 1,
                }}
              >
                Dismiss
              </button>
            )}

            <span style={{ fontSize: 11, color: 'var(--color-border-muted)', marginLeft: 'auto' }}>
              kw: {job.keyword_score}
              {job.llm_score !== null && ` | llm: ${job.llm_score}`}
            </span>
          </div>

          {/* Cover Letter Panel */}
          {coverLetterError && (
            <div style={{
              marginTop: 12,
              padding: 12,
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--color-danger)',
            }}>
              {coverLetterError}
            </div>
          )}

          {docError && (
            <div style={{
              marginTop: 12,
              padding: 12,
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--color-danger)',
            }}>
              {docError}
            </div>
          )}

          {docOk && (
            <div style={{
              marginTop: 12,
              padding: 12,
              background: 'rgba(34, 197, 94, 0.06)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--color-success)',
            }}>
              ✅ {docOk}
            </div>
          )}

          {coverLetter && (
            <div style={{
              marginTop: 12,
              background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border-muted)',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'rgba(168, 85, 247, 0.08)',
                borderBottom: '1px solid var(--color-border-muted)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#a855f7' }}>
                  Cover Letter Draft
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={handleCopy}
                    style={{
                      background: copied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid',
                      borderColor: copied ? 'rgba(34, 197, 94, 0.3)' : 'rgba(168, 85, 247, 0.2)',
                      color: copied ? 'var(--color-success)' : '#c084fc',
                      borderRadius: 4,
                      padding: '3px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={handleGenerateCoverLetter}
                    disabled={coverLetterLoading}
                    style={{
                      background: 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid rgba(168, 85, 247, 0.2)',
                      color: '#c084fc',
                      borderRadius: 4,
                      padding: '3px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={() => setCoverLetter(null)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--color-border-muted)',
                      color: 'var(--color-text-tertiary)',
                      borderRadius: 4,
                      padding: '3px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
              {/* Body */}
              <div style={{
                padding: 16,
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}>
                {coverLetter}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
