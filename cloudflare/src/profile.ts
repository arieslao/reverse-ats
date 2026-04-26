// Per-user profile endpoints — Phase 4a.
//
//   GET /api/profile  — returns the current user's profile (auto-creates
//                       an empty row on first call so the frontend can edit
//                       a fresh form without a separate "create" step).
//   PUT /api/profile  — partial update; whitelisted fields only.
//
// All requests require a valid Supabase JWT. user_id is taken from the
// verified token, never from the request body.

import type { Env } from "./schema";
import { verifyRequest } from "./supabase-auth";

// ─── shape ──────────────────────────────────────────────────────────────────

interface ProfileRow {
  user_id: string;
  resume_text: string | null;
  target_roles: string;          // JSON
  target_locations: string;      // JSON
  remote_only: number;           // 0|1
  min_seniority: string | null;
  salary_min: number | null;
  salary_max: number | null;
  must_have_skills: string;      // JSON
  nice_to_have_skills: string;   // JSON
  blacklisted_companies: string; // JSON
  blacklisted_keywords: string;  // JSON
  priority_categories: string;   // JSON
  created_at: string;
  updated_at: string;
}

interface ProfileOut {
  resume_text: string | null;
  target_roles: string[];
  target_locations: string[];
  remote_only: boolean;
  min_seniority: string | null;
  salary_min: number | null;
  salary_max: number | null;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  blacklisted_companies: string[];
  blacklisted_keywords: string[];
  priority_categories: string[];
  updated_at: string;
}

// Fields the client may write. user_id, created_at, updated_at are server-managed.
const WRITABLE_SCALAR_FIELDS = ["resume_text", "min_seniority", "salary_min", "salary_max"] as const;
const WRITABLE_ARRAY_FIELDS = [
  "target_roles",
  "target_locations",
  "must_have_skills",
  "nice_to_have_skills",
  "blacklisted_companies",
  "blacklisted_keywords",
  "priority_categories",
] as const;

// ─── router ─────────────────────────────────────────────────────────────────

export async function handleProfile(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/profile")) return null;

  const identity = await verifyRequest(request, env);
  if (!identity) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  if (url.pathname === "/api/profile") {
    if (request.method === "GET") return getProfile(env, identity.userId);
    if (request.method === "PUT") return putProfile(request, env, identity.userId);
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }
  if (url.pathname === "/api/profile/suggest-roles" && request.method === "POST") {
    return suggestRolesHandler(env, identity.userId);
  }
  return null;
}

// ─── GET ────────────────────────────────────────────────────────────────────

async function getProfile(env: Env, userId: string): Promise<Response> {
  let row = await env.DB.prepare(`SELECT * FROM user_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<ProfileRow>();

  if (!row) {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO user_profiles (user_id, created_at, updated_at) VALUES (?, ?, ?)`,
    )
      .bind(userId, now, now)
      .run();
    row = await env.DB.prepare(`SELECT * FROM user_profiles WHERE user_id = ?`)
      .bind(userId)
      .first<ProfileRow>();
  }
  if (!row) return jsonResponse({ ok: false, error: "profile insert failed" }, 500);

  return jsonResponse({ ok: true, profile: rowToOut(row) }, 200);
}

// ─── PUT ────────────────────────────────────────────────────────────────────

async function putProfile(request: Request, env: Env, userId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }

  // Build the SET clause from whitelisted fields. We do an upsert so the very
  // first PUT works even if GET hasn't been called yet.
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  for (const field of WRITABLE_SCALAR_FIELDS) {
    if (!(field in body)) continue;
    const v = body[field];
    if (field === "salary_min" || field === "salary_max") {
      if (v === null || v === undefined || v === "") {
        sets.push(`${field} = ?`);
        values.push(null);
      } else if (typeof v === "number" && Number.isFinite(v)) {
        sets.push(`${field} = ?`);
        values.push(Math.round(v));
      } else {
        return jsonResponse({ ok: false, error: `${field} must be a number or null` }, 400);
      }
    } else {
      // resume_text, min_seniority — string|null
      if (v === null || v === undefined) {
        sets.push(`${field} = ?`);
        values.push(null);
      } else if (typeof v === "string") {
        sets.push(`${field} = ?`);
        values.push(v);
      } else {
        return jsonResponse({ ok: false, error: `${field} must be a string or null` }, 400);
      }
    }
  }

  for (const field of WRITABLE_ARRAY_FIELDS) {
    if (!(field in body)) continue;
    const v = body[field];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
      return jsonResponse({ ok: false, error: `${field} must be an array of strings` }, 400);
    }
    sets.push(`${field} = ?`);
    values.push(JSON.stringify(v));
  }

  if ("remote_only" in body) {
    const v = body.remote_only;
    if (typeof v !== "boolean") {
      return jsonResponse({ ok: false, error: "remote_only must be a boolean" }, 400);
    }
    sets.push(`remote_only = ?`);
    values.push(v ? 1 : 0);
  }

  const now = new Date().toISOString();

  // Ensure a row exists (idempotent insert), then apply updates.
  await env.DB.prepare(
    `INSERT INTO user_profiles (user_id, created_at, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO NOTHING`,
  )
    .bind(userId, now, now)
    .run();

  if (sets.length > 0) {
    sets.push(`updated_at = ?`);
    values.push(now);
    values.push(userId);
    await env.DB.prepare(
      `UPDATE user_profiles SET ${sets.join(", ")} WHERE user_id = ?`,
    )
      .bind(...values)
      .run();
  }

  const row = await env.DB.prepare(`SELECT * FROM user_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<ProfileRow>();
  if (!row) return jsonResponse({ ok: false, error: "profile not found after update" }, 500);

  return jsonResponse({ ok: true, profile: rowToOut(row) }, 200);
}

// ─── POST /api/profile/suggest-roles ────────────────────────────────────────
//
// Asks Llama 3.1 8B (Workers AI) to recommend role titles based on the user's
// stored resume_text. Returns two lists — current_fit (could land today) and
// next_step (one-level-up career progression).

const SUGGEST_ROLES_MODEL = "@cf/meta/llama-3.1-8b-instruct";

const SUGGEST_ROLES_SYSTEM_PROMPT = `You are an experienced career coach reviewing a candidate's resume.

Your job is to recommend job titles for them to target. Output TWO lists:

1. **current_fit** — 6 to 10 role titles the candidate could land TODAY based on
   the experience already on their resume. These should match (or be one notch
   below) their current/most-recent seniority. Include obvious peer roles and
   adjacent specializations they're directly qualified for.

2. **next_step** — 4 to 8 role titles that represent a NATURAL CAREER PROGRESSION
   from where they are now. These are stretch roles — typically one level up in
   seniority or scope, OR a logical pivot into an adjacent function their
   experience qualifies them to grow into.

For each role, include a one-sentence rationale grounded in specific evidence
from their resume — name the actual companies, technologies, or
responsibilities you saw.

Return ONLY valid JSON with this exact structure:

{
  "current_fit": [
    {"title": "<exact role title>", "reasoning": "<one sentence citing resume evidence>"}
  ],
  "next_step": [
    {"title": "<exact role title>", "reasoning": "<one sentence citing resume evidence>"}
  ]
}

Rules:
- Use industry-standard job titles (e.g. "VP of Engineering", "Senior Director of Data Science").
- Do NOT invent roles or repeat the same title across both lists.
- Output JSON only — no prose, no markdown fences.
`;

interface RoleSuggestion {
  title: string;
  reasoning: string;
}

async function suggestRolesHandler(env: Env, userId: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT resume_text FROM user_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<{ resume_text: string | null }>();

  const resume = (row?.resume_text || "").trim();
  if (resume.length < 50) {
    return jsonResponse(
      {
        ok: false,
        error: "Resume is too short. Paste your resume above and save first.",
      },
      400,
    );
  }

  const userPrompt =
    `## Candidate Resume\n\n${resume.slice(0, 6000)}\n\n` +
    `Recommend roles per the system instructions.`;

  // Workers AI structured-output: pass a JSON schema and the runtime
  // constrains the model so the output is always valid JSON of this shape.
  const roleItem = {
    type: "object",
    properties: {
      title: { type: "string" },
      reasoning: { type: "string" },
    },
    required: ["title", "reasoning"],
  };
  const responseSchema = {
    type: "object",
    properties: {
      current_fit: { type: "array", items: roleItem },
      next_step: { type: "array", items: roleItem },
    },
    required: ["current_fit", "next_step"],
  };

  let raw = "";
  try {
    const response = (await env.AI.run(SUGGEST_ROLES_MODEL, {
      messages: [
        { role: "system", content: SUGGEST_ROLES_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2500,
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: responseSchema },
    } as Parameters<typeof env.AI.run>[1])) as { response?: string };
    raw = (response.response || "").trim();
  } catch (err) {
    return jsonResponse(
      { ok: false, error: `LLM call failed: ${err instanceof Error ? err.message : String(err)}` },
      502,
    );
  }

  console.log(`[suggest-roles] raw response (${raw.length} chars):`, raw.slice(0, 500));

  const parsed = parseJsonLoose(raw);
  if (!parsed || typeof parsed !== "object") {
    console.log(`[suggest-roles] parse failed. full raw:`, raw);
    return jsonResponse(
      {
        ok: false,
        error: `Model returned unparseable response (${raw.length} chars). Try again.`,
        raw_preview: raw.slice(0, 800),
      },
      502,
    );
  }
  const obj = parsed as { current_fit?: unknown; next_step?: unknown };

  return jsonResponse(
    {
      ok: true,
      current_fit: cleanSuggestions(obj.current_fit, 10),
      next_step: cleanSuggestions(obj.next_step, 8),
      model: SUGGEST_ROLES_MODEL,
    },
    200,
  );
}

function cleanSuggestions(raw: unknown, max: number): RoleSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: RoleSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as { title?: unknown; reasoning?: unknown };
    const title = typeof r.title === "string" ? r.title.trim() : "";
    const reasoning = typeof r.reasoning === "string" ? r.reasoning.trim() : "";
    if (!title || title.length > 80) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, reasoning: reasoning.slice(0, 240) });
    if (out.length >= max) break;
  }
  return out;
}

function parseJsonLoose(text: string): unknown {
  if (!text) return null;
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function rowToOut(row: ProfileRow): ProfileOut {
  return {
    resume_text: row.resume_text,
    target_roles: parseJsonArray(row.target_roles),
    target_locations: parseJsonArray(row.target_locations),
    remote_only: row.remote_only === 1,
    min_seniority: row.min_seniority,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    must_have_skills: parseJsonArray(row.must_have_skills),
    nice_to_have_skills: parseJsonArray(row.nice_to_have_skills),
    blacklisted_companies: parseJsonArray(row.blacklisted_companies),
    blacklisted_keywords: parseJsonArray(row.blacklisted_keywords),
    priority_categories: parseJsonArray(row.priority_categories),
    updated_at: row.updated_at,
  };
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
