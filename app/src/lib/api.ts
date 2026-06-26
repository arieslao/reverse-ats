const BASE = '' // proxied via vite

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  return res.json()
}

// Tailored résumé / cover letter — browser-native download.
// We navigate a hidden iframe to a GET endpoint that responds with the .docx as a
// Content-Disposition attachment, so the browser's own download manager writes the
// file. This avoids blob/object-URL handling, which fails silently on insecure (HTTP)
// origins and when saving straight into a cloud-synced folder (the stuck .crdownload).
function browserDownload(path: string): Promise<void> {
  const token = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const sep = path.includes('?') ? '&' : '?'
  // Standard same-origin download: <a download> pointed at the GET endpoint. The
  // browser's own download manager fetches + writes the file (Content-Disposition
  // attachment) — no blob, no iframe, works on HTTP origins.
  const a = document.createElement('a')
  a.href = `${BASE}${path}${sep}token=${token}`
  a.setAttribute('download', '')
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => a.remove(), 2_000)
  // The server sets cookie rats_dl=<token> once the file is delivered; resolve on
  // that, or after a hard 35s cap so the button never spins indefinitely.
  return new Promise((resolve) => {
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (document.cookie.includes(`rats_dl=${token}`) || Date.now() - started > 35_000) {
        window.clearInterval(timer)
        document.cookie = 'rats_dl=; path=/; max-age=0'
        resolve()
      }
    }, 500)
  })
}
export const downloadTailoredResume = (jobId: string) =>
  browserDownload(`/api/jobs/${encodeURIComponent(jobId)}/tailored-resume.docx`)
export const downloadCoverLetterDocx = (jobId: string) =>
  browserDownload(`/api/jobs/${encodeURIComponent(jobId)}/cover-letter.docx`)
// Email both docs as .docx attachments (no browser download involved).
export const emailJobDocs = (jobId: string) =>
  request<{ status: string; to: string; attached: string[] }>(
    `/api/jobs/${encodeURIComponent(jobId)}/email-docs`, { method: 'POST' })

// Inventory (skill GROUPS — name + keywords, years reasoned from dated history, basis)
export interface InvSkill {
  name: string
  keywords: string[]
  years_label: string | null
  years_num: number | null
  basis: string | null
  source: string
}
export interface InvExperience { company: string; title: string; start: string | null; end: string | null; location: string | null; highlights: string[] }
export interface Inventory {
  skills: InvSkill[]
  experience: InvExperience[]
  education: { school: string; degree: string | null; field: string | null }[]
  certifications: { name: string; issuer: string | null }[]
  summary: string | null
  total_years_experience: number | null
  sources: string[]
  updated_at: string | null
}
export const fetchInventory = () => request<Inventory>('/api/inventory')
export const extractInventory = () => request<Inventory>('/api/inventory/extract', { method: 'POST', body: JSON.stringify({}) })
export const extractInventoryFromText = (text: string, source = 'linkedin') =>
  request<Inventory>('/api/inventory/extract', { method: 'POST', body: JSON.stringify({ text, source }) })
export const saveInventory = (patch: Partial<Inventory>) =>
  request<Inventory>('/api/inventory', { method: 'PUT', body: JSON.stringify(patch) })

// Résumé upload — parse a PDF/DOCX/TXT server-side into the profile resume_text.
export const uploadResume = async (file: File): Promise<{ resume_text: string; chars: number }> => {
  const fd = new FormData()
  fd.append('file', file)
  // No Content-Type header — the browser sets the multipart boundary.
  const res = await fetch('/api/profile/resume-upload', { method: 'POST', body: fd })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error((d as { detail?: string }).detail || `upload failed: ${res.status}`)
  }
  return res.json()
}

// Jobs
export const fetchJobs = (params: Record<string, string | number | boolean>) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) qs.set(k, String(v))
  })
  return request<import('./types').JobListResponse>(`/api/jobs?${qs}`)
}

export const fetchJob = (id: string) =>
  request<import('./types').Job>(`/api/jobs/${id}`)

export const dismissJob = (id: string) =>
  request(`/api/jobs/${id}/dismiss`, { method: 'POST' })

export const saveJob = (id: string) =>
  request<import('./types').PipelineEntry>(`/api/jobs/${id}/save`, { method: 'POST' })

// Pipeline
export const fetchPipeline = () =>
  request<import('./types').PipelineListResponse>('/api/pipeline')

export const createPipelineEntry = (data: { job_id: string; stage?: string; notes?: string }) =>
  request<import('./types').PipelineEntry>('/api/pipeline', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updatePipelineEntry = (id: number, data: Record<string, unknown>) =>
  request<import('./types').PipelineEntry>(`/api/pipeline/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deletePipelineEntry = (id: number) =>
  request(`/api/pipeline/${id}`, { method: 'DELETE' })

export const fetchPipelineEvents = (id: number) =>
  request<import('./types').PipelineEvent[]>(`/api/pipeline/${id}/events`)

// Profile
export const fetchProfile = () =>
  request<import('./types').Profile>('/api/profile')

export const updateProfile = (data: Partial<import('./types').Profile>) =>
  request<import('./types').Profile>('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  })

// Companies
export const fetchCompanies = (params?: { category?: string; enabled_only?: boolean }) => {
  const qs = new URLSearchParams()
  if (params?.category) qs.set('category', params.category)
  if (params?.enabled_only !== undefined) qs.set('enabled_only', String(params.enabled_only))
  return request<import('./types').Company[]>(`/api/admin/companies?${qs}`)
}

export const createCompany = (data: Partial<import('./types').Company>) =>
  request<import('./types').Company>('/api/admin/companies', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateCompany = (id: number, data: Partial<import('./types').Company>) =>
  request<import('./types').Company>(`/api/admin/companies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteCompany = (id: number) =>
  request(`/api/admin/companies/${id}`, { method: 'DELETE' })

// Analytics
export const fetchAnalytics = () =>
  request<import('./types').Analytics>('/api/analytics')

// Scrape
export const fetchScrapeStatus = () =>
  request<import('./types').ScrapeRun | null>('/api/scrape/status')

export const triggerScrape = () =>
  request('/api/scrape/trigger', { method: 'POST' })

// Scoring — backfill / re-score
export const fetchScoreStats = () =>
  request<{ total: number; scored: number; unscored: number }>('/api/scoring/stats')

export interface BackupInfo {
  path: string
  filename?: string
  size_bytes: number
  reason?: string
  created_at: string
}

export const triggerRescore = (mode: 'unscored' | 'all' = 'unscored') =>
  request<{ status: string; mode: string; cleared: number; backup: BackupInfo | null }>(
    `/api/scoring/rescore${mode === 'all' ? '?all=true' : ''}`,
    { method: 'POST' },
  )

// Backups
export const fetchBackups = () => request<BackupInfo[]>('/api/admin/backups')

export const createBackup = (reason = 'manual') =>
  request<BackupInfo>(`/api/admin/backups?reason=${encodeURIComponent(reason)}`, { method: 'POST' })

// LLM Settings
export const fetchLLMSettings = () =>
  request<import('./types').LLMSettings>('/api/admin/llm-settings')

export const updateLLMSettings = (data: Partial<import('./types').LLMSettings>) =>
  request<import('./types').LLMSettings>('/api/admin/llm-settings', { method: 'PUT', body: JSON.stringify(data) })

export const testLLMSettings = () =>
  request<{ health: { healthy: boolean; provider: string; message: string }; test_score: { score: number; reasoning: string }; provider: string }>('/api/admin/llm-settings/test', { method: 'POST' })

export const generateCoverLetter = (jobId: string) =>
  request<{ cover_letter: string; provider: string; error: string | null }>(`/api/jobs/${jobId}/cover-letter`, { method: 'POST' })

// Role suggester — AI-recommended target roles from the user's resume
export interface RoleSuggestion {
  title: string
  reasoning: string
}
export interface RoleSuggestions {
  current_fit: RoleSuggestion[]
  next_step: RoleSuggestion[]
  provider: string
  error: string | null
}

export const suggestRoles = () =>
  request<RoleSuggestions>('/api/profile/suggest-roles', { method: 'POST' })

// Feed industries (dynamic dropdown — distinct categories currently in DB)
export const fetchFeedIndustries = () =>
  request<{ id: string; label: string; count: number }[]>('/api/feed/industries')

// Feed locations — parsed city/state/country tokens from active jobs
export interface LocationToken { name: string; count: number }
export interface FeedLocations {
  countries: LocationToken[]
  states: LocationToken[]
  cities: LocationToken[]
  remote: { count: number }
}
export const fetchFeedLocations = (filter?: string[]) => {
  const qs = filter && filter.length > 0 ? `?filter=${encodeURIComponent(filter.join(','))}` : ''
  return request<FeedLocations>(`/api/feed/locations${qs}`)
}

// Industry Packs
export const fetchIndustryPacks = () =>
  request<{ id: string; name: string; description: string; count: number }[]>('/api/admin/industry-packs')

export const installIndustryPack = (packId: string) =>
  request<{ pack_id: string; installed: number; skipped: number; total: number }>(`/api/admin/industry-packs/${packId}/install`, { method: 'POST' })
