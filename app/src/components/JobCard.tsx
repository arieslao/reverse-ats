import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Job } from '../lib/types'
import { dismissJob, saveJob, generateCoverLetter } from '../lib/api'
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

export function JobCard({ job }: JobCardProps) {
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()

  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [coverLetterLoading, setCoverLetterLoading] = useState(false)
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
        background: '#1a1d27',
        border: '1px solid #2e3140',
        borderRadius: 8,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        opacity: job.expired ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = '#2e3140'
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#e4e4e7' }}>{job.company}</span>
            {job.remote && (
              <span
                style={{
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: '#22c55e',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Remote
              </span>
            )}
            {job.expired && (
              <span
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#f87171',
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
                  border: '1px solid #2e3140',
                  color: '#71717a',
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
            <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>{job.location}</div>
          )}
        </div>

        {/* Score + meta */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <ScoreBadge score={score} />
          <span style={{ fontSize: 11, color: '#52525b' }}>{timeAgo(job.first_seen_at)}</span>
        </div>
      </div>

      {/* Tags row */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {job.category && (
          <span
            style={{
              background: '#242736',
              border: '1px solid #2e3140',
              color: '#a1a1aa',
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
              background: '#242736',
              border: '1px solid #2e3140',
              color: '#71717a',
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
                background: '#0f1117',
                borderRadius: 6,
                fontSize: 13,
                color: '#a1a1aa',
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
                color: '#93c5fd',
                lineHeight: 1.5,
              }}
            >
              <span style={{ fontWeight: 600, color: '#3b82f6' }}>AI Reasoning: </span>
              {job.llm_reasoning}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              style={{
                background: '#3b82f6',
                color: '#fff',
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
                  color: '#22c55e',
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

            {!job.dismissed && (
              <button
                disabled={dismissMut.isPending}
                onClick={() => dismissMut.mutate()}
                style={{
                  background: 'transparent',
                  border: '1px solid #2e3140',
                  color: '#71717a',
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

            <span style={{ fontSize: 11, color: '#3f3f46', marginLeft: 'auto' }}>
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
              color: '#f87171',
            }}>
              {coverLetterError}
            </div>
          )}

          {coverLetter && (
            <div style={{
              marginTop: 12,
              background: '#0f1117',
              border: '1px solid #2e3140',
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
                borderBottom: '1px solid #2e3140',
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
                      color: copied ? '#22c55e' : '#c084fc',
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
                      border: '1px solid #2e3140',
                      color: '#71717a',
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
                color: '#d4d4d8',
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
