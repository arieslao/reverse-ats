export type PipelineStage =
  | 'discovered'
  | 'saved'
  | 'applied'
  | 'phone_screen'
  | 'technical'
  | 'final'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

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
  keyword_score: number
  llm_score: number | null
  llm_reasoning: string | null
  first_seen_at: string
  last_seen_at: string
  expired: boolean
  dismissed: boolean
  pipeline_stage: PipelineStage | null
}

export interface JobListResponse {
  jobs: Job[]
  total: number
  page: number
  per_page: number
}

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
  job: Job | null
  // Joined fields from jobs table
  company?: string
  title?: string
  location?: string
  url?: string
  keyword_score?: number
  llm_score?: number | null
}

export interface PipelineListResponse {
  items: PipelineEntry[]
  by_stage: Record<string, PipelineEntry[]>
}

export interface PipelineEvent {
  id: number
  pipeline_id: number
  from_stage: string | null
  to_stage: string
  note: string | null
  created_at: string
}

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
  updated_at: string | null
}

export interface Company {
  id: number
  name: string
  ats: string
  slug: string
  category: string
  enabled: boolean
  careers_url: string | null
  workday_url: string | null
  created_at: string
  updated_at: string
}

export interface Analytics {
  funnel: { stage: string; count: number }[]
  total_discovered: number
  total_applied: number
  response_rate: number
  by_company: Record<string, { discovered: number; in_pipeline: number }>
  weekly_activity: { week: string; discovered: number; applied: number }[]
}

export interface ScrapeRun {
  id: number
  started_at: string
  completed_at: string | null
  total_fetched: number
  new_jobs: number
  updated_jobs: number
  expired_jobs: number
  llm_scored: number
  errors: string[]
}

export interface LLMSettings {
  provider: string
  api_key: string | null
  api_url: string | null
  model: string | null
  temperature: number
  max_tokens: number
  updated_at: string | null
}

export interface LLMProvider {
  id: string
  name: string
  default_url: string
  default_model: string
  requires_key: boolean
}
