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

export async function suggestRoles(): Promise<SuggestRolesResult> {
  const r = await authFetch('/api/profile/suggest-roles', { method: 'POST' })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const msg = (data && (data as { error?: string }).error) || `suggest-roles failed: ${r.status}`
    throw new Error(msg)
  }
  return {
    current_fit: ((data as { current_fit?: RoleSuggestion[] }).current_fit) || [],
    next_step: ((data as { next_step?: RoleSuggestion[] }).next_step) || [],
  }
}
