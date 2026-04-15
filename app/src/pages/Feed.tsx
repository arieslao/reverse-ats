import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { fetchJobs } from '../lib/api'
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
}

function parseFilters(params: URLSearchParams): FilterState {
  return {
    search: params.get('search') || '',
    category: params.get('category') || '',
    min_score: Number(params.get('min_score') || 0),
    remote_only: params.get('remote_only') === 'true',
    since_days: Number(params.get('since_days') || 0),
    sort_by: params.get('sort_by') || 'score',
    exclude_companies: params.get('exclude_companies') || '',
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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['jobs', queryParams],
    queryFn: () => fetchJobs(queryParams),
  })

  const { data: scrapeStatus } = useQuery({
    queryKey: ['scrape-status'],
    queryFn: () => fetch('/api/scrape/status').then((r) => r.json()).catch(() => null),
    refetchInterval: 60000,
  })

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
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#e4e4e7', letterSpacing: '-0.02em' }}>
            Job Feed
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#71717a' }}>
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
            border: '1px solid #2e3140',
            borderRadius: 6,
            color: isRefreshing ? '#52525b' : '#a1a1aa',
            fontSize: 13,
            padding: '6px 12px',
            cursor: isRefreshing || isLoading ? 'not-allowed' : 'pointer',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!isRefreshing && !isLoading) {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#3b82f6'
            }
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#2e3140'
            ;(e.currentTarget as HTMLButtonElement).style.color = isRefreshing ? '#52525b' : '#a1a1aa'
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
      <FilterBar filters={filters} onChange={handleFilterChange} />

      {/* Stats bar */}
      {data && (
        <div
          style={{
            display: 'flex',
            gap: 24,
            margin: '14px 0',
            padding: '10px 16px',
            background: '#1a1d27',
            border: '1px solid #2e3140',
            borderRadius: 6,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Stat label="Total Results" value={data.total} />
          <div style={{ width: 1, background: '#2e3140', alignSelf: 'stretch' }} />
          <Stat label="New Today" value={newToday} color="#22c55e" />
          <div style={{ width: 1, background: '#2e3140', alignSelf: 'stretch' }} />
          <Stat label="Avg Score" value={avgScore} color={avgScore >= 70 ? '#22c55e' : avgScore >= 50 ? '#3b82f6' : '#a1a1aa'} />
          <div style={{ width: 1, background: '#2e3140', alignSelf: 'stretch' }} />
          <Stat label="Page" value={`${page} / ${totalPages}`} />
          {scrapeStatus?.last_run && (
            <>
              <div style={{ width: 1, background: '#2e3140', alignSelf: 'stretch' }} />
              <Stat label="Last Scraped" value={timeAgoFromNow(scrapeStatus.last_run)} color="#71717a" />
            </>
          )}
        </div>
      )}

      {/* Job list */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#52525b' }}>
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
            color: '#f87171',
            fontSize: 14,
          }}
        >
          Failed to load jobs: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#52525b' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>—</div>
          <div style={{ fontSize: 15, color: '#3f3f46' }}>No jobs match your filters</div>
        </div>
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
                  borderColor: pageNum === page ? '#3b82f6' : '#2e3140',
                  background: pageNum === page ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                  color: pageNum === page ? '#3b82f6' : '#a1a1aa',
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
      <div style={{ fontSize: 10, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || '#e4e4e7', fontFamily: 'monospace', marginTop: 1 }}>
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
        border: '1px solid #2e3140',
        background: 'transparent',
        color: disabled ? '#3f3f46' : '#a1a1aa',
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
