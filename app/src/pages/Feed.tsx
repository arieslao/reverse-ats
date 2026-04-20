import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { fetchJobs, fetchFeedIndustries, fetchFeedLocations } from '../lib/api'
import { JobCard } from '../components/JobCard'
import { FilterBar } from '../components/FilterBar'

const PAGE_SIZE = 20

interface FilterState {
  search: string
  category: string
  min_score: number
  remote_only: boolean
  since_days: number
  sort_by: string
  exclude_companies: string
  locations: string[]
}

function parseFilters(params: URLSearchParams): FilterState {
  const rawLocs = params.get('locations') || ''
  return {
    search: params.get('search') || '',
    category: params.get('category') || '',
    min_score: Number(params.get('min_score') || 0),
    remote_only: params.get('remote_only') === 'true',
    since_days: Number(params.get('since_days') || 0),
    sort_by: params.get('sort_by') || 'score',
    exclude_companies: params.get('exclude_companies') || '',
    locations: rawLocs ? rawLocs.split(',').map((s) => s.trim()).filter(Boolean) : [],
  }
}

export function Feed() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FilterState>(() => parseFilters(searchParams))
  const [isRefreshing, setIsRefreshing] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    setPage(1)
  }, [filters])

  const queryParams: Record<string, string | number | boolean> = {
    page,
    per_page: PAGE_SIZE,
  }
  if (filters.search) queryParams.search = filters.search
  if (filters.category) queryParams.category = filters.category
  if (filters.min_score > 0) queryParams.min_score = filters.min_score
  if (filters.remote_only) queryParams.remote_only = true
  if (filters.since_days > 0) queryParams.since_days = filters.since_days
  if (filters.sort_by && filters.sort_by !== 'score') queryParams.sort_by = filters.sort_by
  if (filters.exclude_companies) queryParams.exclude_companies = filters.exclude_companies
  if (filters.locations.length > 0) queryParams.locations = filters.locations.join(',')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['jobs', queryParams],
    queryFn: () => fetchJobs(queryParams),
  })

  const { data: scrapeStatus } = useQuery({
    queryKey: ['scrape-status'],
    queryFn: () => fetch('/api/scrape/status').then((r) => r.json()).catch(() => null),
    refetchInterval: 60000,
  })

  const { data: industriesData } = useQuery({
    queryKey: ['feed-industries'],
    queryFn: fetchFeedIndustries,
    staleTime: 5 * 60 * 1000,
  })

  // Hierarchical narrowing: refetch the location buckets keyed off the
  // current selection. Picking "United States" reduces the States/Cities
  // columns to only those that appear in US-tagged jobs.
  const { data: locationsData } = useQuery({
    queryKey: ['feed-locations', filters.locations.join(',')],
    queryFn: () => fetchFeedLocations(filters.locations),
    staleTime: 60 * 1000,
  })

  const industryOptions = useMemo(
    () =>
      (industriesData ?? []).map((i) => ({
        value: i.id,
        label: i.count > 0 ? `${i.label} (${i.count})` : i.label,
      })),
    [industriesData],
  )

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters)
    const params: Record<string, string> = {}
    if (newFilters.search) params.search = newFilters.search
    if (newFilters.category) params.category = newFilters.category
    if (newFilters.min_score > 0) params.min_score = String(newFilters.min_score)
    if (newFilters.remote_only) params.remote_only = 'true'
    if (newFilters.since_days > 0) params.since_days = String(newFilters.since_days)
    if (newFilters.sort_by && newFilters.sort_by !== 'score') params.sort_by = newFilters.sort_by
    if (newFilters.exclude_companies) params.exclude_companies = newFilters.exclude_companies
    if (newFilters.locations.length > 0) params.locations = newFilters.locations.join(',')
    setSearchParams(params, { replace: true })
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Trigger a full scrape + score run on the backend (runs in background)
    try {
      await fetch('/api/scrape/trigger', { method: 'POST' })
    } catch { /* ignore — scrape runs async */ }
    // Refresh the UI data
    await queryClient.invalidateQueries({ queryKey: ['jobs'] })
    await queryClient.invalidateQueries({ queryKey: ['scrape-status'] })
    setTimeout(() => setIsRefreshing(false), 2000)
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1
  const jobs = data?.jobs || []
  const newToday = jobs.filter((j) => {
    const diff = Date.now() - new Date(j.first_seen_at).getTime()
    return diff < 86400000
  }).length

  const avgScore =
    jobs.length > 0
      ? Math.round(jobs.reduce((sum, j) => sum + (j.llm_score ?? j.keyword_score), 0) / jobs.length)
      : 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            Job Feed
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            Browse and filter discovered opportunities
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: '1px solid var(--color-border-muted)',
            borderRadius: 6,
            color: isRefreshing ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
            fontSize: 13,
            padding: '6px 12px',
            cursor: isRefreshing || isLoading ? 'not-allowed' : 'pointer',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!isRefreshing && !isLoading) {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent)'
            }
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border-muted)'
            ;(e.currentTarget as HTMLButtonElement).style.color = isRefreshing ? 'var(--color-text-muted)' : 'var(--color-text-secondary)'
          }}
        >
          <span
            style={{
              display: 'inline-block',
              animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none',
            }}
          >
            ↻
          </span>
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        industries={industryOptions}
        locationsData={locationsData}
        matchingCount={data?.total ?? null}
        isLoading={isLoading}
      />

      {/* Stats bar */}
      {data && (
        <div
          style={{
            display: 'flex',
            gap: 24,
            margin: '14px 0',
            padding: '10px 16px',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-muted)',
            borderRadius: 6,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Stat label="Total Results" value={data.total} />
          <div style={{ width: 1, background: 'var(--color-border-muted)', alignSelf: 'stretch' }} />
          <Stat label="New Today" value={newToday} color="var(--color-success)" />
          <div style={{ width: 1, background: 'var(--color-border-muted)', alignSelf: 'stretch' }} />
          <Stat label="Avg Score" value={avgScore} color={avgScore >= 70 ? 'var(--color-success)' : avgScore >= 50 ? 'var(--color-accent)' : 'var(--color-text-secondary)'} />
          <div style={{ width: 1, background: 'var(--color-border-muted)', alignSelf: 'stretch' }} />
          <Stat label="Page" value={`${page} / ${totalPages}`} />
          {scrapeStatus?.last_run && (
            <>
              <div style={{ width: 1, background: 'var(--color-border-muted)', alignSelf: 'stretch' }} />
              <Stat label="Last Scraped" value={timeAgoFromNow(scrapeStatus.last_run)} color="var(--color-text-tertiary)" />
            </>
          )}
        </div>
      )}

      {/* Job list */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>
          Loading jobs...
        </div>
      )}

      {isError && (
        <div
          style={{
            padding: 16,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 8,
            color: 'var(--color-danger)',
            fontSize: 14,
          }}
        >
          Failed to load jobs: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <EmptyFeed
          hasFilters={Boolean(
            filters.search ||
              filters.category ||
              filters.min_score > 0 ||
              filters.exclude_companies ||
              filters.since_days > 0 ||
              filters.locations.length > 0,
          )}
          totalEverScraped={data?.total ?? 0}
          isRefreshing={isRefreshing}
          onTriggerScrape={handleRefresh}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            marginTop: 24,
          }}
        >
          <PagBtn
            label="Prev"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          />

          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number
            if (totalPages <= 7) {
              pageNum = i + 1
            } else if (page <= 4) {
              pageNum = i + 1
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i
            } else {
              pageNum = page - 3 + i
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 4,
                  border: '1px solid',
                  borderColor: pageNum === page ? 'var(--color-accent)' : 'var(--color-border-muted)',
                  background: pageNum === page ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                  color: pageNum === page ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {pageNum}
              </button>
            )
          })}

          <PagBtn
            label="Next"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </div>
      )}
    </div>
  )
}

// Empty-state shown when there are no jobs to render. Distinguishes between
// "filters too narrow" (have data but none match) and "fresh install" (no
// jobs in DB yet) so a brand-new user knows their next step.
function EmptyFeed({
  hasFilters,
  totalEverScraped,
  isRefreshing,
  onTriggerScrape,
}: {
  hasFilters: boolean
  totalEverScraped: number
  isRefreshing: boolean
  onTriggerScrape: () => void
}) {
  // Filters narrowed everything away
  if (hasFilters && totalEverScraped === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--color-text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>—</div>
        <div style={{ fontSize: 15, color: 'var(--color-border-muted)' }}>No jobs match your filters</div>
      </div>
    )
  }

  // Fresh install — no jobs in DB at all. Walk the user through setup.
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-muted)',
        borderRadius: 8,
        color: 'var(--color-text-secondary)',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 16 }}>👋</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
        Welcome to Reverse ATS
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', maxWidth: 520, margin: '0 auto 24px', lineHeight: 1.6 }}>
        No jobs scraped yet. To get the best results, set up your profile first
        so the LLM can score jobs against your background.
      </div>
      <ol
        style={{
          textAlign: 'left',
          maxWidth: 480,
          margin: '0 auto 28px',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.9,
          paddingLeft: 24,
        }}
      >
        <li>
          Go to <a href="/admin" style={{ color: 'var(--color-accent)' }}>Admin → Profile &amp; Resume</a> and paste your resume + target roles
        </li>
        <li>
          (Optional) Configure an LLM provider in <a href="/admin" style={{ color: 'var(--color-accent)' }}>Admin → LLM Settings</a> for AI-scored matches
        </li>
        <li>
          Add or pick companies to track in <a href="/admin" style={{ color: 'var(--color-accent)' }}>Admin → Company Manager</a>
        </li>
        <li>Click the button below to run your first scrape</li>
      </ol>
      <button
        onClick={onTriggerScrape}
        disabled={isRefreshing}
        style={{
          background: 'var(--color-accent)',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          padding: '10px 20px',
          cursor: isRefreshing ? 'not-allowed' : 'pointer',
          opacity: isRefreshing ? 0.6 : 1,
        }}
      >
        {isRefreshing ? 'Scraping…' : 'Run first scrape'}
      </button>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 12 }}>
        First scrape takes 1–2 minutes (about 1 second per company)
      </div>
    </div>
  )
}

function timeAgoFromNow(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--color-text-primary)', fontFamily: 'monospace', marginTop: 1 }}>
        {value}
      </div>
    </div>
  )
}

function PagBtn({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px',
        borderRadius: 4,
        border: '1px solid var(--color-border-muted)',
        background: 'transparent',
        color: disabled ? 'var(--color-border-muted)' : 'var(--color-text-secondary)',
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
