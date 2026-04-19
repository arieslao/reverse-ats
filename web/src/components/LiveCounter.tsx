import { useEffect, useState } from 'react'
import { fetchHealth, type Health } from '../lib/api'

// Pulls live numbers from the Worker /health endpoint. Real data = trust.
// Frame is conversational: "Right now, here's what's happening" not "STATS".

export function LiveCounter() {
  const [health, setHealth] = useState<Health | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const data = await fetchHealth()
      if (!cancelled) {
        setHealth(data)
        setLoaded(true)
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <section className="px-5 sm:px-8 pb-20 sm:pb-24">
      <div className="max-w-4xl mx-auto">
        <div
          className="rounded-3xl p-8 sm:p-10"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          {/* Lead-in copy — sets the human tone before any numbers */}
          <div className="flex items-center gap-2.5 mb-6">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: health ? 'var(--color-success)' : 'var(--color-text-muted)' }}
              aria-hidden
            />
            <span
              className="text-xs uppercase tracking-[0.16em] font-medium"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Right now, in our database
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10">
            <Stat
              value={health?.total_jobs}
              label="Open jobs we're tracking for you"
              loaded={loaded}
            />
            <Stat
              value={health?.total_preprocessed}
              label="Job descriptions an AI has read carefully"
              loaded={loaded}
              tooltip="Each job is parsed by an open-weight LLM (Llama 3.1 8B on Cloudflare's free tier) into structured fields: required skills, seniority, comp range, remote policy."
            />
            <Stat
              value={220}
              label="Companies checked every 30 minutes"
              loaded
              static_
            />
          </div>

          <p
            className="mt-7 text-sm leading-relaxed"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            These numbers refresh every 60 seconds — and they come straight from{' '}
            <a
              href="https://reverse-ats-ingest.aries-lao.workers.dev/health"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              our public health endpoint
            </a>
            . Not analytics theater. Real numbers from the real database.
          </p>
        </div>
      </div>
    </section>
  )
}

function Stat({
  value,
  label,
  loaded,
  tooltip,
  static_,
}: {
  value: number | null | undefined
  label: string
  loaded: boolean
  tooltip?: string
  static_?: boolean
}) {
  return (
    <div title={tooltip}>
      <div
        className="text-4xl sm:text-5xl tabular-nums"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.025em',
          lineHeight: 1,
        }}
      >
        {!loaded ? (
          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
        ) : value == null ? (
          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
        ) : (
          value.toLocaleString()
        )}
        {static_ && (
          <span
            className="text-xl ml-1"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            +
          </span>
        )}
      </div>
      <div
        className="mt-3 text-sm leading-snug"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {label}
      </div>
    </div>
  )
}
