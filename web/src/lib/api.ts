// Reads from the live Cloudflare Worker. Override with VITE_API_URL in
// .env.local to point at a local Worker during development.

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://reverse-ats-ingest.aries-lao.workers.dev'

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
