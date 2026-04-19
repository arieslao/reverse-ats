import { useEffect, useState } from 'react'
import { fetchHealth, type Health } from '../lib/api'

// Pulls live numbers from the Worker /health endpoint. Real data = trust.
// Falls back gracefully if the API is unreachable (still says something useful).

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
    // Refresh every 60s — keeps the page feeling alive without hammering the API
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <section className="px-5 sm:px-8 pb-16">
      <div className="max-w-4xl mx-auto">
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: health ? 'var(--color-success)' : 'var(--color-text-muted)' }}
              aria-hidden
            />
            <span
              className="text-xs uppercase tracking-wider font-medium"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Live data from the open-source pipeline
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <Stat
              value={health?.total_jobs}
              label="Jobs being tracked"
              loaded={loaded}
            />
            <Stat
              value={health?.total_preprocessed}
              label="AI-extracted job summaries"
              loaded={loaded}
              tooltip="Each job is parsed by an open-weight LLM (Llama 3.1 8B on Cloudflare's free tier) into structured fields: required skills, seniority, comp range, remote policy."
            />
            <Stat
              value={220}
              label="Companies scraped daily"
              loaded
              static_
            />
          </div>

          <p
            className="mt-6 text-xs"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Numbers refresh every 60s. Pulled directly from{' '}
            <a
              href="https://reverse-ats-ingest.aries-lao.workers.dev/health"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              our public health endpoint
            </a>
            . No analytics theater — this is the real database.
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
        className="text-3xl sm:text-4xl font-semibold tabular-nums"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {!loaded ? (
          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
        ) : value == null ? (
          <span style={{ color: 'var(--color-text-muted)' }}>?</span>
        ) : (
          value.toLocaleString()
        )}
        {static_ && (
          <span
            className="text-base ml-1"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            +
          </span>
        )}
      </div>
      <div
        className="mt-1.5 text-sm"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {label}
      </div>
    </div>
  )
}
