import { useEffect, useState } from 'react'
import { fetchHealth, type Health } from '../lib/api'

// Live numbers from the Worker. Apple-style: massive display digits,
// quiet labels underneath, generous spacing.

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
    <section className="px-5 sm:px-8 py-12 sm:py-16">
      <div className="max-w-6xl mx-auto">
        {/* Lead-in */}
        <div className="flex items-center justify-center gap-2.5 mb-10 sm:mb-14">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: health ? 'var(--color-success)' : 'var(--color-text-muted)',
              boxShadow: health ? '0 0 0 4px color-mix(in srgb, var(--color-success) 20%, transparent)' : 'none',
            }}
            aria-hidden
          />
          <span
            className="text-[12px] uppercase tracking-[0.16em]"
            style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}
          >
            Right now, in our database
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-8">
          <Stat
            value={health?.total_jobs}
            label="Open jobs we're tracking for you"
            loaded={loaded}
          />
          <Stat
            value={health?.total_preprocessed}
            label="Jobs already analyzed by AI"
            loaded={loaded}
          />
          <Stat
            value={220}
            label="Companies checked every 30 minutes"
            loaded
            static_
          />
        </div>

        <p
          className="mt-12 text-[13px] text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Refreshes every 60 seconds, pulled live from{' '}
          <a
            href="https://reverse-ats-ingest.aries-lao.workers.dev/health"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            our public health endpoint
          </a>
          .
        </p>
      </div>
    </section>
  )
}

function Stat({
  value,
  label,
  loaded,
  static_,
}: {
  value: number | null | undefined
  label: string
  loaded: boolean
  static_?: boolean
}) {
  return (
    <div className="text-center">
      <div
        className="tabular-nums"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(3rem, 6vw, 4.5rem)',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.04em',
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
            className="text-2xl ml-1"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            +
          </span>
        )}
      </div>
      <div
        className="mt-3 text-[14px]"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {label}
      </div>
    </div>
  )
}
