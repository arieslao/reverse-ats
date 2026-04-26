// TypeScript types matching the D1 schema in migrations/0001_initial.sql.
// Keep these in sync — Workers code reads/writes through these shapes.

export interface Env {
  DB: D1Database;
  AI: Ai;
  INGEST_SECRET: string;
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
}

export interface IngestRequest {
  source: string;          // 'github-actions' | 'manual'
  jobs: IngestJob[];
  scrape_run_id?: string;  // optional client-side correlation id
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
  total_preprocessed: number;
  total_embedded: number;
  last_ingest_at: string | null;
  last_ingest_jobs: number | null;
}
