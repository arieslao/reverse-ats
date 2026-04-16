const BASE = '' // proxied via vite

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
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

// LLM Settings
export const fetchLLMSettings = () =>
  request<import('./types').LLMSettings>('/api/admin/llm-settings')

export const updateLLMSettings = (data: Partial<import('./types').LLMSettings>) =>
  request<import('./types').LLMSettings>('/api/admin/llm-settings', { method: 'PUT', body: JSON.stringify(data) })

export const testLLMSettings = () =>
  request<{ health: { healthy: boolean; provider: string; message: string }; test_score: { score: number; reasoning: string }; provider: string }>('/api/admin/llm-settings/test', { method: 'POST' })

export const generateCoverLetter = (jobId: string) =>
  request<{ cover_letter: string; provider: string; error: string | null }>(`/api/jobs/${jobId}/cover-letter`, { method: 'POST' })

// Feed industries (dynamic dropdown — distinct categories currently in DB)
export const fetchFeedIndustries = () =>
  request<{ id: string; label: string; count: number }[]>('/api/feed/industries')

// Industry Packs
export const fetchIndustryPacks = () =>
  request<{ id: string; name: string; description: string; count: number }[]>('/api/admin/industry-packs')

export const installIndustryPack = (packId: string) =>
  request<{ pack_id: string; installed: number; skipped: number; total: number }>(`/api/admin/industry-packs/${packId}/install`, { method: 'POST' })
