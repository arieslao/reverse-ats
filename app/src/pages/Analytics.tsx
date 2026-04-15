import { useQuery } from '@tanstack/react-query'
import { fetchAnalytics } from '../lib/api'
import type { Analytics as AnalyticsData } from '../lib/types'

const STAGE_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  saved: 'Saved',
  applied: 'Applied',
  phone_screen: 'Phone Screen',
  technical: 'Technical',
  final: 'Final Round',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

const STAGE_COLORS: Record<string, string> = {
  discovered: '#71717a',
  saved: '#3b82f6',
  applied: '#818cf8',
  phone_screen: '#c084fc',
  technical: '#f59e0b',
  final: '#fb923c',
  offer: '#22c55e',
  rejected: '#f87171',
  withdrawn: '#52525b',
}

function FunnelChart({ funnel }: { funnel: { stage: string; count: number }[] }) {
  const max = Math.max(...funnel.map((f) => f.count), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {funnel.map((item) => {
        const pct = (item.count / max) * 100
        const color = STAGE_COLORS[item.stage] || '#3b82f6'

        return (
          <div key={item.stage} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 100, fontSize: 12, color: '#a1a1aa', textAlign: 'right', flexShrink: 0 }}>
              {STAGE_LABELS[item.stage] || item.stage}
            </div>
            <div style={{ flex: 1, height: 24, background: '#1a1d27', borderRadius: 4, overflow: 'hidden', border: '1px solid #2e3140' }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: color,
                  opacity: 0.7,
                  borderRadius: 3,
                  transition: 'width 0.4s ease',
                  minWidth: item.count > 0 ? 4 : 0,
                }}
              />
            </div>
            <div style={{ width: 30, fontSize: 12, fontWeight: 700, color: '#e4e4e7', fontFamily: 'monospace' }}>
              {item.count}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function WeeklyChart({ data }: { data: { week: string; discovered: number; applied: number }[] }) {
  if (!data || data.length === 0) {
    return <div style={{ color: '#52525b', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No weekly data yet</div>
  }

  const maxVal = Math.max(...data.flatMap((d) => [d.discovered, d.applied]), 1)

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120, paddingBottom: 24, position: 'relative' }}>
      {data.map((week) => (
        <div
          key={week.week}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
        >
          <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 90 }}>
            <div
              style={{
                flex: 1,
                height: `${(week.discovered / maxVal) * 100}%`,
                background: 'rgba(59, 130, 246, 0.5)',
                borderRadius: '2px 2px 0 0',
                minHeight: week.discovered > 0 ? 4 : 0,
              }}
              title={`Discovered: ${week.discovered}`}
            />
            <div
              style={{
                flex: 1,
                height: `${(week.applied / maxVal) * 100}%`,
                background: 'rgba(130, 140, 248, 0.7)',
                borderRadius: '2px 2px 0 0',
                minHeight: week.applied > 0 ? 4 : 0,
              }}
              title={`Applied: ${week.applied}`}
            />
          </div>
          <div style={{ fontSize: 10, color: '#52525b', whiteSpace: 'nowrap', textAlign: 'center' }}>
            {week.week.slice(5)}
          </div>
        </div>
      ))}
    </div>
  )
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div
      style={{
        background: '#1a1d27',
        border: '1px solid #2e3140',
        borderRadius: 8,
        padding: '16px 20px',
      }}
    >
      <div style={{ fontSize: 11, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || '#e4e4e7', fontFamily: 'monospace', marginTop: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#71717a', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function Analytics() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
  })

  if (isLoading) {
    return (
      <div style={{ padding: 24, color: '#52525b', textAlign: 'center', marginTop: 48 }}>
        Loading analytics...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#f87171' }}>
          Failed to load analytics.
        </div>
      </div>
    )
  }

  const analytics: AnalyticsData = data
  const responseRatePct = Math.round((analytics.response_rate || 0) * 100)
  const companyRows = Object.entries(analytics.by_company || {}).sort(
    (a, b) => b[1].discovered - a[1].discovered,
  )

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#e4e4e7', letterSpacing: '-0.02em' }}>
          Analytics
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#71717a' }}>
          Application funnel and pipeline metrics
        </p>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <MetricCard
          label="Total Discovered"
          value={analytics.total_discovered}
          sub="Jobs found by scrapers"
        />
        <MetricCard
          label="Total Applied"
          value={analytics.total_applied}
          sub="Applications submitted"
          color="#818cf8"
        />
        <MetricCard
          label="Response Rate"
          value={`${responseRatePct}%`}
          sub="Interviews / Applications"
          color={responseRatePct >= 20 ? '#22c55e' : responseRatePct >= 10 ? '#f59e0b' : '#f87171'}
        />
      </div>

      {/* Funnel + Weekly charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div
          style={{
            background: '#1a1d27',
            border: '1px solid #2e3140',
            borderRadius: 8,
            padding: '16px 20px',
          }}
        >
          <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Application Funnel
          </h3>
          {analytics.funnel && analytics.funnel.length > 0 ? (
            <FunnelChart funnel={analytics.funnel} />
          ) : (
            <div style={{ color: '#52525b', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              No funnel data yet
            </div>
          )}
        </div>

        <div
          style={{
            background: '#1a1d27',
            border: '1px solid #2e3140',
            borderRadius: 8,
            padding: '16px 20px',
          }}
        >
          <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Weekly Activity
          </h3>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
            <Legend color="rgba(59,130,246,0.5)" label="Discovered" />
            <Legend color="rgba(130,140,248,0.7)" label="Applied" />
          </div>
          <WeeklyChart data={analytics.weekly_activity || []} />
        </div>
      </div>

      {/* Company breakdown */}
      <div
        style={{
          background: '#1a1d27',
          border: '1px solid #2e3140',
          borderRadius: 8,
          padding: '16px 20px',
        }}
      >
        <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Company Breakdown
        </h3>

        {companyRows.length === 0 ? (
          <div style={{ color: '#52525b', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            No company data yet
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Company', 'Discovered', 'In Pipeline', 'Pipeline %'].map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      fontSize: 11,
                      color: '#52525b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: '1px solid #2e3140',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companyRows.slice(0, 20).map(([company, stats]) => {
                const pct = stats.discovered > 0
                  ? Math.round((stats.in_pipeline / stats.discovered) * 100)
                  : 0
                return (
                  <tr key={company}>
                    <td style={{ padding: '7px 8px', color: '#e4e4e7', borderBottom: '1px solid #1e2030' }}>
                      {company}
                    </td>
                    <td style={{ padding: '7px 8px', color: '#a1a1aa', fontFamily: 'monospace', borderBottom: '1px solid #1e2030' }}>
                      {stats.discovered}
                    </td>
                    <td style={{ padding: '7px 8px', color: '#818cf8', fontFamily: 'monospace', borderBottom: '1px solid #1e2030' }}>
                      {stats.in_pipeline}
                    </td>
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid #1e2030' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: '#242736', borderRadius: 3, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              background: pct >= 20 ? '#22c55e' : '#3b82f6',
                              borderRadius: 3,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 11, color: '#71717a', fontFamily: 'monospace' }}>
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 12, height: 10, background: color, borderRadius: 2 }} />
      <span style={{ fontSize: 11, color: '#71717a' }}>{label}</span>
    </div>
  )
}
