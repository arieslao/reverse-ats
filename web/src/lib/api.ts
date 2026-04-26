// Reads from the live Cloudflare Worker. Override with VITE_API_URL in
// .env.local to point at a local Worker during development.

import { getAccessToken, refreshAccessToken } from './supabase'

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://reverse-ats-ingest.aries-lao.workers.dev'

/** Fetch with the cached Supabase JWT in the Authorization header.
 *  Reads the token from the in-memory cache (kept in sync by
 *  onAuthStateChange). On 401, refreshes once and retries — so a long-open
 *  session that crossed the JWT TTL self-heals instead of failing. */
async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let res = await sendWithToken(path, init, getAccessToken())
  if (res.status === 401) {
    const fresh = await refreshAccessToken()
    if (fresh) res = await sendWithToken(path, init, fresh)
  }
  return res
}

async function sendWithToken(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${API_URL}${path}`, { ...init, headers, cache: 'no-store' })
}

export interface Health {
  ok: true
  total_jobs: number
  total_preprocessed: number
  total_embedded: number
  last_ingest_at: string | null
  last_ingest_jobs: number | null
}

export async function fetchHealth(): Promise<Health | null> {
  try {
    const r = await fetch(`${API_URL}/health`, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()) as Health
  } catch {
    return null
  }
}

export interface JobSummary {
  id: string
  company: string
  title: string
  url: string
  location: string | null
  category: string | null
  first_seen_at: string
  last_seen_at: string
}

export async function fetchRecentJobs(limit = 10): Promise<JobSummary[]> {
  try {
    const r = await fetch(`${API_URL}/jobs?limit=${limit}`, { cache: 'no-store' })
    if (!r.ok) return []
    const data = await r.json()
    return (data.jobs || []) as JobSummary[]
  } catch {
    return []
  }
}

// ─── Admin (requires admin tier) ──────────────────────────────────────────

export type Tier = 'free' | 'sponsor' | 'admin'

export interface AdminUser {
  id: string
  email: string
  tier: Tier
  created_at: string
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const r = await authFetch('/admin/users')
  if (!r.ok) throw new Error(`admin users fetch failed: ${r.status}`)
  const data = await r.json()
  return (data.users || []) as AdminUser[]
}

export async function updateUserTier(userId: string, tier: Tier): Promise<AdminUser> {
  const r = await authFetch(`/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  })
  if (!r.ok) throw new Error(`tier update failed: ${r.status}`)
  const data = await r.json()
  return data.user as AdminUser
}

// ─── Profile (per-user, requires sign-in) ─────────────────────────────────

export interface Profile {
  resume_text: string | null
  target_roles: string[]
  target_locations: string[]
  remote_only: boolean
  min_seniority: string | null
  salary_min: number | null
  salary_max: number | null
  must_have_skills: string[]
  nice_to_have_skills: string[]
  blacklisted_companies: string[]
  blacklisted_keywords: string[]
  priority_categories: string[]
  updated_at: string
}

export async function fetchProfile(): Promise<Profile> {
  const r = await authFetch('/api/profile')
  if (!r.ok) throw new Error(`profile fetch failed: ${r.status}`)
  const data = await r.json()
  return data.profile as Profile
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const r = await authFetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error(`profile update failed: ${r.status}`)
  const data = await r.json()
  return data.profile as Profile
}

export interface RoleSuggestion {
  title: string
  reasoning: string
}

export interface SuggestRolesResult {
  current_fit: RoleSuggestion[]
  next_step: RoleSuggestion[]
}

// ─── Feed / Jobs ───────────────────────────────────────────────────────────

export type PipelineStage =
  | 'saved' | 'applied' | 'phone_screen' | 'technical' | 'final' | 'offer' | 'rejected' | 'withdrawn'

export interface Job {
  id: string
  company: string
  title: string
  location: string | null
  department: string | null
  url: string
  description_snippet: string | null
  description_full: string | null
  category: string | null
  ats_type: string | null
  remote: boolean
  llm_score: number | null
  llm_reasoning: string | null
  first_seen_at: string
  last_seen_at: string
  posted_at: string | null
  /** Number of distinct job_ids sharing this listing's content fingerprint
   *  (company + normalized title + location). 1 = first instance, >1 = repost. */
  repost_count: number
  /** ISO timestamp of when we first saw any job with this fingerprint. */
  repost_first_seen_at: string | null
  expired: boolean
  dismissed: boolean
  pipeline_stage: PipelineStage | null
}

export interface JobListResponse {
  ok: true
  jobs: Job[]
  total: number
  page: number
  per_page: number
}

export interface JobsQuery {
  page?: number
  per_page?: number
  search?: string
  category?: string
  min_score?: number
  remote_only?: boolean
  since_days?: number
  sort_by?: 'score' | 'newest' | 'company'
  locations?: string[]
}

export async function fetchJobs(q: JobsQuery): Promise<JobListResponse> {
  const qs = new URLSearchParams()
  if (q.page) qs.set('page', String(q.page))
  if (q.per_page) qs.set('per_page', String(q.per_page))
  if (q.search) qs.set('search', q.search)
  if (q.category) qs.set('category', q.category)
  if (q.min_score) qs.set('min_score', String(q.min_score))
  if (q.remote_only) qs.set('remote_only', 'true')
  if (q.since_days) qs.set('since_days', String(q.since_days))
  if (q.sort_by) qs.set('sort_by', q.sort_by)
  if (q.locations && q.locations.length > 0) qs.set('locations', q.locations.join(','))
  const r = await authFetch(`/api/jobs?${qs}`)
  if (!r.ok) throw new Error(`fetchJobs: ${r.status}`)
  return r.json()
}

export async function dismissJob(jobId: string): Promise<void> {
  const r = await authFetch(`/api/jobs/${encodeURIComponent(jobId)}/dismiss`, { method: 'POST' })
  if (!r.ok) throw new Error(`dismiss: ${r.status}`)
}

export async function saveJob(jobId: string): Promise<void> {
  const r = await authFetch(`/api/jobs/${encodeURIComponent(jobId)}/save`, { method: 'POST' })
  if (!r.ok) {
    const data = await r.json().catch(() => null) as { error?: string; tier?: Tier; usage?: UsageState } | null
    const err = new Error(data?.error || `save: ${r.status}`) as Error & { status?: number; tier?: Tier; usage?: UsageState }
    err.status = r.status
    err.tier = data?.tier
    err.usage = data?.usage
    throw err
  }
}

export interface UsageState {
  used: number
  remaining: number
  limit: number
}

export type CoverLetterStyle = 'concise' | 'standard' | 'detailed'

export interface CoverLetterResult {
  cover_letter: string
  style?: CoverLetterStyle
  tier?: Tier
  usage?: UsageState
}

export async function generateCoverLetter(
  jobId: string,
  style: CoverLetterStyle = 'standard',
): Promise<CoverLetterResult> {
  const r = await authFetch(`/api/jobs/${encodeURIComponent(jobId)}/cover-letter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style }),
  })
  const data = await r.json().catch(() => null) as {
    cover_letter?: string
    style?: CoverLetterStyle
    error?: string
    tier?: Tier
    usage?: UsageState
  } | null
  if (!r.ok) {
    const err = new Error(data?.error || `cover-letter: ${r.status}`) as Error & {
      status?: number
      tier?: Tier
      usage?: UsageState
    }
    err.status = r.status
    err.tier = data?.tier
    err.usage = data?.usage
    throw err
  }
  return {
    cover_letter: data?.cover_letter || '',
    style: data?.style,
    tier: data?.tier,
    usage: data?.usage,
  }
}

export interface UsageOverview {
  tier: Tier
  usage: Record<string, UsageState>
}

export async function fetchUsage(): Promise<UsageOverview> {
  const r = await authFetch('/api/usage')
  if (!r.ok) throw new Error(`usage: ${r.status}`)
  return r.json()
}

export interface IndustryOption { id: string; label: string; count: number }
export async function fetchFeedIndustries(): Promise<IndustryOption[]> {
  const r = await authFetch('/api/feed/industries')
  if (!r.ok) throw new Error(`industries: ${r.status}`)
  const data = await r.json()
  return (data.industries || []) as IndustryOption[]
}

// ─── Pipeline ──────────────────────────────────────────────────────────────

export interface PipelineEntry {
  id: number
  job_id: string
  stage: PipelineStage
  applied_at: string | null
  notes: string | null
  contact_name: string | null
  contact_email: string | null
  contact_role: string | null
  next_step: string | null
  next_step_date: string | null
  salary_offered: number | null
  cover_letter: string | null
  created_at: string
  updated_at: string
  company: string
  title: string
  location: string | null
  url: string
  remote: boolean
  llm_score: number | null
  llm_reasoning: string | null
}

export interface PipelineListResponse {
  ok: true
  items: PipelineEntry[]
  by_stage: Record<string, PipelineEntry[]>
}

export async function fetchPipeline(): Promise<PipelineListResponse> {
  const r = await authFetch('/api/pipeline')
  if (!r.ok) throw new Error(`pipeline: ${r.status}`)
  return r.json()
}

export async function updatePipelineEntry(
  id: number,
  patch: Partial<Pick<PipelineEntry, 'stage' | 'notes' | 'contact_name' | 'contact_email' | 'contact_role' | 'next_step' | 'next_step_date' | 'salary_offered' | 'cover_letter'>>,
): Promise<PipelineEntry> {
  const r = await authFetch(`/api/pipeline/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error(`pipeline update: ${r.status}`)
  const data = await r.json()
  return data.entry as PipelineEntry
}

export async function deletePipelineEntry(id: number): Promise<void> {
  const r = await authFetch(`/api/pipeline/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`pipeline delete: ${r.status}`)
}

export interface PipelineEvent {
  id: number
  pipeline_id: number
  from_stage: PipelineStage | null
  to_stage: PipelineStage
  note: string | null
  created_at: string
}

export async function fetchPipelineEvents(id: number): Promise<PipelineEvent[]> {
  const r = await authFetch(`/api/pipeline/${id}/events`)
  if (!r.ok) throw new Error(`pipeline events: ${r.status}`)
  const data = await r.json()
  return (data.events || []) as PipelineEvent[]
}

// ─── Analytics + Scoring ──────────────────────────────────────────────────

export interface AnalyticsResult {
  funnel: { stage: string; count: number }[]
  total_saved: number
  total_applied: number
  response_rate: number
  total_dismissed: number
}

export async function fetchAnalytics(): Promise<AnalyticsResult> {
  const r = await authFetch('/api/analytics')
  if (!r.ok) throw new Error(`analytics: ${r.status}`)
  const data = await r.json()
  return data
}

export interface ScoringStats { total: number; scored: number; unscored: number }
export async function fetchScoringStats(): Promise<ScoringStats> {
  const r = await authFetch('/api/scoring/stats')
  if (!r.ok) throw new Error(`scoring stats: ${r.status}`)
  return r.json()
}

export async function rescoreJobs(all = false): Promise<{ scored: number; batch?: number; has_more?: boolean; message?: string; usage?: UsageState }> {
  const r = await authFetch(`/api/scoring/rescore${all ? '?all=true' : ''}`, { method: 'POST' })
  const data = await r.json().catch(() => null) as {
    scored?: number; batch?: number; has_more?: boolean; error?: string; message?: string
    tier?: Tier; usage?: UsageState
  } | null
  if (!r.ok) {
    const err = new Error(data?.error || `rescore: ${r.status}`) as Error & {
      status?: number; tier?: Tier; usage?: UsageState
    }
    err.status = r.status
    err.tier = data?.tier
    err.usage = data?.usage
    throw err
  }
  return {
    scored: data?.scored || 0,
    batch: data?.batch,
    has_more: data?.has_more,
    message: data?.message,
    usage: data?.usage,
  }
}

export async function suggestRoles(): Promise<SuggestRolesResult> {
  const r = await authFetch('/api/profile/suggest-roles', { method: 'POST' })
  const data = await r.json().catch(() => null) as {
    current_fit?: RoleSuggestion[]
    next_step?: RoleSuggestion[]
    error?: string
    tier?: Tier
    usage?: UsageState
  } | null
  if (!r.ok) {
    const err = new Error(data?.error || `suggest-roles failed: ${r.status}`) as Error & {
      status?: number
      tier?: Tier
      usage?: UsageState
    }
    err.status = r.status
    err.tier = data?.tier
    err.usage = data?.usage
    throw err
  }
  return {
    current_fit: data?.current_fit || [],
    next_step: data?.next_step || [],
  }
}
