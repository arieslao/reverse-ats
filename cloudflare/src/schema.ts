// TypeScript types matching the D1 schema in migrations/0001_initial.sql.
// Keep these in sync — Workers code reads/writes through these shapes.

export interface Env {
  DB: D1Database;
  AI: Ai;
  INGEST_SECRET: string;
  // Dedicated read-only token so unattended monitors can poll
  // GET /admin/scrape-health without an expiring admin JWT.
  // Set via `wrangler secret put SCRAPE_HEALTH_TOKEN`.
  SCRAPE_HEALTH_TOKEN: string;
  // Supabase — public URL (also lives in the frontend bundle, set via [vars]).
  SUPABASE_URL: string;
  // Service-role key — set via `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`.
  // Used for admin operations (read all profiles, update tier, etc.).
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// Verified Supabase identity, derived from the JWT in Authorization header.
export interface AuthedUser {
  userId: string;
  email: string;
  tier: "free" | "sponsor" | "admin";
}

// Wire format the Python pipeline sends to POST /ingest.
// Matches the `_row_to_dict` shape from backend/db.py upsert_job inputs.
export interface IngestJob {
  id: string;
  company: string;
  title: string;
  url: string;
  location?: string | null;
  department?: string | null;
  team?: string | null;
  description_full?: string | null;
  description_snippet?: string | null;
  category?: string | null;
  ats_type?: string | null;
  remote?: boolean | number;
  first_seen_at?: string;
  last_seen_at?: string;
  // ISO-8601 employer-side posted/updated date from the source ATS
  // (Greenhouse `updated_at`, Lever `createdAt`, Ashby `publishedAt`, …).
  // Optional — not every ATS surfaces it.
  posted_at?: string | null;
  // Ashby `employmentType` / Lever-mapped `commitment`:
  // FullTime|PartTime|Intern|Contract|Temporary.
  employment_type?: string | null;
  // Ashby `workplaceType` / Lever-mapped `workplaceType`:
  // OnSite|Remote|Hybrid. Finer than the legacy `remote` boolean.
  workplace_type?: string | null;
  // Annual salary range in `salary_currency` (USD by default).
  // NULL when employer hasn't disclosed comp.
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  // Human-readable comp string from the employer's posting (Ashby's
  // `compensationTierSummary`). Rendered verbatim when present.
  comp_summary?: string | null;
}

// Per-company scrape outcome from one pipeline run. The pipeline pushes one
// of these per company in the registry so we can answer "is this slug still
// alive?" without re-running the audit script. Persisted to
// `scrape_company_runs` (migration 0009).
export interface CompanyStat {
  company: string;
  ats: string;
  slug: string;
  raw_count: number;       // jobs returned by ATS API (pre-filter)
  filtered_count: number;  // jobs after title/remote filter
  error?: string | null;   // null on success
}

export interface IngestRequest {
  source: string;          // 'github-actions' | 'manual'
  jobs: IngestJob[];
  scrape_run_id?: string;  // optional client-side correlation id
  // Optional. Older pipeline.py versions (pre-2026-05-17) won't send this;
  // handler treats missing field as a no-op so existing CI keeps working.
  company_stats?: CompanyStat[];
}

export interface IngestResponse {
  ok: boolean;
  ingest_run_id: number;
  received: number;
  new: number;
  updated: number;
  errors: string[];
}

// Output shape of preprocess.ts (matches jobs_structured columns).
export interface StructuredJob {
  seniority: string | null;
  years_experience_min: number | null;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  responsibilities: string[];
  comp_min: number | null;
  comp_max: number | null;
  remote_policy: string | null;
  industry_tags: string[];
}

// Health endpoint shape.
export interface HealthResponse {
  ok: true;
  total_jobs: number;
  active_jobs: number;       // expired = 0
  expired_jobs: number;      // expired = 1 (delisted / stale)
  total_preprocessed: number;
  preprocess_backlog: number; // active jobs with no jobs_structured row yet
  total_embedded: number;
  last_ingest_at: string | null;
  last_ingest_jobs: number | null;
}

// One pending job handed to the off-box (GX10) preprocessing lane.
export interface PreprocessPendingJob {
  id: string;
  title: string;
  company: string;
  description: string | null;
}

// Result the GX10 lane POSTs back per job after local-LLM extraction.
export interface PreprocessResult {
  job_id: string;
  structured?: StructuredJob | null;
  error?: string | null;
}
