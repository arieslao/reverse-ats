// Per-user structured skills + experience inventory — Phase 2.
//
//   GET  /api/inventory                  — current merged inventory (auto-creates)
//   PUT  /api/inventory                  — manual edit (replace any section)
//   POST /api/inventory/extract-resume   — LLM-extract from resume text, merge
//   POST /api/inventory/extract-linkedin — LLM-extract from pasted LinkedIn text, merge
//   POST /api/inventory/linkedin-import  — deterministic merge of parsed export rows
//
// The inventory is the canonical structured source for gap matching (Phase 3)
// and tailored docs (Phase 4). It's assembled from multiple sources and merged
// with provenance: skills dedup by normalized name (keep best years/proficiency,
// union sources); experience/education/certs dedup by identity key. Every write
// recomputes the user's resume embedding from the richer inventory so the
// cosine-ranked feed improves immediately.

import type { Env } from "./schema";
import { embedText, packVector } from "./embed";
import { verifyRequest, fetchTier } from "./supabase-auth";
import { checkAndConsume, limitFor } from "./usage";

const EXTRACT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// ─── shapes ─────────────────────────────────────────────────────────────────

export interface Skill {
  name: string;
  category: string | null;     // e.g. "language", "framework", "cloud", "soft"
  years: number | null;
  proficiency: number | null;  // 1-5
  last_used: string | null;    // free text / year
  source: string;              // 'resume' | 'linkedin' | 'manual'
}
export interface Experience {
  company: string;
  title: string;
  start: string | null;
  end: string | null;          // null/"" => present
  location: string | null;
  highlights: string[];
  source?: string;
}
export interface Education {
  school: string;
  degree: string | null;
  field: string | null;
  start: string | null;
  end: string | null;
}
export interface Certification {
  name: string;
  issuer: string | null;
  date: string | null;
}
export interface Inventory {
  skills: Skill[];
  experience: Experience[];
  education: Education[];
  certifications: Certification[];
  summary: string | null;
  total_years_experience: number | null;
  sources: string[];
  updated_at?: string;
}

interface InventoryRow {
  user_id: string;
  skills: string;
  experience: string;
  education: string;
  certifications: string;
  summary: string | null;
  total_years_experience: number | null;
  sources: string;
  created_at: string;
  updated_at: string;
}

// ─── router ─────────────────────────────────────────────────────────────────

export async function handleInventory(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/inventory")) return null;

  const identity = await verifyRequest(request, env);
  if (!identity) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  const userId = identity.userId;

  if (url.pathname === "/api/inventory") {
    if (request.method === "GET") return getInventory(env, userId);
    if (request.method === "PUT") return putInventory(request, env, userId);
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }
  if (request.method === "POST" && url.pathname === "/api/inventory/extract-resume") {
    return extractFromText(request, env, userId, "resume");
  }
  if (request.method === "POST" && url.pathname === "/api/inventory/extract-linkedin") {
    return extractFromText(request, env, userId, "linkedin");
  }
  if (request.method === "POST" && url.pathname === "/api/inventory/linkedin-import") {
    return linkedinImport(request, env, userId);
  }
  return null;
}

// ─── GET / PUT ──────────────────────────────────────────────────────────────

async function getInventory(env: Env, userId: string): Promise<Response> {
  const inv = await loadInventory(env, userId);
  return jsonResponse({ ok: true, inventory: inv }, 200);
}

async function putInventory(request: Request, env: Env, userId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }

  const current = await loadInventory(env, userId);
  // Manual edits fully replace the provided sections (the UI sends the edited
  // arrays back). Unspecified sections are left untouched.
  const next: Inventory = {
    skills: "skills" in body ? normalizeSkills(body.skills, "manual") : current.skills,
    experience: "experience" in body ? normalizeExperience(body.experience, "manual") : current.experience,
    education: "education" in body ? normalizeEducation(body.education) : current.education,
    certifications:
      "certifications" in body ? normalizeCertifications(body.certifications) : current.certifications,
    summary: "summary" in body ? (typeof body.summary === "string" ? body.summary.slice(0, 2000) : null) : current.summary,
    total_years_experience:
      "total_years_experience" in body ? cleanNum(body.total_years_experience) : current.total_years_experience,
    sources: current.sources.includes("manual") ? current.sources : [...current.sources, "manual"],
  };

  await saveInventory(env, userId, next);
  await reembedFromInventory(env, userId).catch((e) =>
    console.log(`[inventory] reembed failed for ${userId}: ${e}`),
  );
  return jsonResponse({ ok: true, inventory: { ...next, updated_at: new Date().toISOString() } }, 200);
}

// ─── LLM extraction (resume text or pasted LinkedIn text) ───────────────────

const EXTRACT_SYSTEM_PROMPT = `You extract a structured professional inventory from a resume or LinkedIn profile.

Output ONLY valid JSON in this exact shape:

{
  "summary": "<2-3 sentence professional summary, or null>",
  "total_years_experience": <number or null>,
  "skills": [
    {"name": "<specific skill>", "category": "<language|framework|cloud|database|tool|domain|soft|other>", "years": <int or null>, "proficiency": <1-5 or null>, "last_used": "<year or null>"}
  ],
  "experience": [
    {"company": "<name>", "title": "<title>", "start": "<YYYY or YYYY-MM or null>", "end": "<YYYY or YYYY-MM, or null if current>", "location": "<or null>", "highlights": ["<concise bullet>", ...]}
  ],
  "education": [
    {"school": "<name>", "degree": "<e.g. BS, MBA, or null>", "field": "<or null>", "start": "<or null>", "end": "<or null>"}
  ],
  "certifications": [
    {"name": "<cert>", "issuer": "<or null>", "date": "<or null>"}
  ]
}

Rules:
- Skills must be SPECIFIC (e.g. "Python", "Kubernetes", "Snowflake"), not vague ("programming", "communication" is fine as soft).
- proficiency: infer 1-5 from seniority/recency/depth of evidence; null if unclear.
- years: estimate from when the skill first appears to most recent use; null if unknowable.
- highlights: 2-5 per role, action-verb first, under 20 words, quantified where the text gives numbers.
- Do NOT invent data. If a section is absent, return an empty array (or null for summary).
- Output JSON only — no prose, no markdown fences.`;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: ["string", "null"] },
    total_years_experience: { type: ["number", "null"] },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: ["string", "null"] },
          years: { type: ["integer", "null"] },
          proficiency: { type: ["integer", "null"] },
          last_used: { type: ["string", "null"] },
        },
        required: ["name"],
      },
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          start: { type: ["string", "null"] },
          end: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          highlights: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          school: { type: "string" },
          degree: { type: ["string", "null"] },
          field: { type: ["string", "null"] },
          start: { type: ["string", "null"] },
          end: { type: ["string", "null"] },
        },
        required: ["school"],
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          issuer: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
        },
        required: ["name"],
      },
    },
  },
  required: ["skills", "experience", "education", "certifications"],
};

async function extractFromText(
  request: Request,
  env: Env,
  userId: string,
  source: "resume" | "linkedin",
): Promise<Response> {
  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 80) {
    return jsonResponse({ ok: false, error: "Not enough text to extract — paste your full resume/profile." }, 400);
  }

  const tier = await fetchTier(env, userId);
  const usage = await checkAndConsume(env, userId, "extract_inventory", tier);
  if (!usage.ok) {
    return jsonResponse(
      {
        ok: false,
        error: `You've used your ${usage.limit} inventory extractions for today. Upgrade for ${limitFor("extract_inventory", "sponsor")} per day.`,
        tier,
        usage,
      },
      429,
    );
  }

  let parsed: any = null;
  try {
    const response = (await env.AI.run(EXTRACT_MODEL, {
      messages: [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        { role: "user", content: `## Source document\n\n${text.slice(0, 8000)}\n\nExtract per the instructions.` },
      ],
      max_tokens: 3500,
      temperature: 0.1,
      response_format: { type: "json_schema", json_schema: EXTRACT_SCHEMA },
    } as Parameters<typeof env.AI.run>[1])) as { response?: unknown };
    const r = response.response;
    if (r && typeof r === "object") parsed = r;
    else if (typeof r === "string") parsed = parseJsonLoose(r);
  } catch (err) {
    return jsonResponse({ ok: false, error: `LLM call failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
  if (!parsed || typeof parsed !== "object") {
    return jsonResponse({ ok: false, error: "Model returned unparseable response. Try again." }, 502);
  }

  const extracted: Inventory = {
    skills: normalizeSkills(parsed.skills, source),
    experience: normalizeExperience(parsed.experience, source),
    education: normalizeEducation(parsed.education),
    certifications: normalizeCertifications(parsed.certifications),
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 2000) : null,
    total_years_experience: cleanNum(parsed.total_years_experience),
    sources: [source],
  };

  const current = await loadInventory(env, userId);
  const merged = mergeInventory(current, extracted);
  await saveInventory(env, userId, merged);
  await reembedFromInventory(env, userId).catch((e) =>
    console.log(`[inventory] reembed failed for ${userId}: ${e}`),
  );

  return jsonResponse(
    { ok: true, inventory: { ...merged, updated_at: new Date().toISOString() }, source, usage },
    200,
  );
}

// ─── LinkedIn export import (deterministic, no LLM) ─────────────────────────
//
// The client parses the official "Get a copy of your data" ZIP and posts the
// rows from Profile.csv / Positions.csv / Skills.csv / Education.csv /
// Certifications.csv. We map them straight into the inventory — no model call,
// no daily cap.

async function linkedinImport(request: Request, env: Env, userId: string): Promise<Response> {
  let body: {
    profile?: { summary?: string; headline?: string } | null;
    positions?: any[];
    skills?: any[];
    education?: any[];
    certifications?: any[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }

  const skills: Skill[] = Array.isArray(body.skills)
    ? body.skills
        .map((s) => (typeof s === "string" ? s : s?.Name ?? s?.name))
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .map((name) => ({ name: name.trim(), category: null, years: null, proficiency: null, last_used: null, source: "linkedin" }))
    : [];

  const experience: Experience[] = Array.isArray(body.positions)
    ? body.positions
        .map((p) => ({
          company: str(p?.["Company Name"] ?? p?.company),
          title: str(p?.Title ?? p?.title),
          start: str(p?.["Started On"] ?? p?.start) || null,
          end: str(p?.["Finished On"] ?? p?.end) || null,
          location: str(p?.Location ?? p?.location) || null,
          highlights: splitHighlights(p?.Description ?? p?.description),
          source: "linkedin",
        }))
        .filter((e) => e.company || e.title)
    : [];

  const education: Education[] = Array.isArray(body.education)
    ? body.education
        .map((e) => ({
          school: str(e?.["School Name"] ?? e?.school),
          degree: str(e?.["Degree Name"] ?? e?.degree) || null,
          field: str(e?.["Field Of Study"] ?? e?.field) || null,
          start: str(e?.["Start Date"] ?? e?.start) || null,
          end: str(e?.["End Date"] ?? e?.end) || null,
        }))
        .filter((e) => e.school)
    : [];

  const certifications: Certification[] = Array.isArray(body.certifications)
    ? body.certifications
        .map((c) => ({
          name: str(c?.Name ?? c?.name),
          issuer: str(c?.Authority ?? c?.issuer) || null,
          date: str(c?.["Started On"] ?? c?.date) || null,
        }))
        .filter((c) => c.name)
    : [];

  const summary =
    (body.profile && typeof body.profile === "object"
      ? str(body.profile.summary) || str(body.profile.headline)
      : "") || null;

  const imported: Inventory = {
    skills,
    experience,
    education,
    certifications,
    summary,
    total_years_experience: null,
    sources: ["linkedin"],
  };

  const current = await loadInventory(env, userId);
  const merged = mergeInventory(current, imported);
  await saveInventory(env, userId, merged);
  await reembedFromInventory(env, userId).catch((e) =>
    console.log(`[inventory] reembed failed for ${userId}: ${e}`),
  );

  return jsonResponse(
    {
      ok: true,
      inventory: { ...merged, updated_at: new Date().toISOString() },
      imported: { skills: skills.length, experience: experience.length, education: education.length, certifications: certifications.length },
    },
    200,
  );
}

// ─── merge ──────────────────────────────────────────────────────────────────

export function mergeInventory(a: Inventory, b: Inventory): Inventory {
  return {
    skills: mergeSkills(a.skills, b.skills),
    experience: mergeByKey(a.experience, b.experience, (e) => `${norm(e.company)}|${norm(e.title)}|${norm(e.start || "")}`),
    education: mergeByKey(a.education, b.education, (e) => `${norm(e.school)}|${norm(e.degree || "")}`),
    certifications: mergeByKey(a.certifications, b.certifications, (c) => `${norm(c.name)}|${norm(c.issuer || "")}`),
    summary: b.summary || a.summary,
    total_years_experience: b.total_years_experience ?? a.total_years_experience,
    sources: Array.from(new Set([...a.sources, ...b.sources])),
  };
}

// Skills dedup by normalized name: keep the richer value (max years, max
// proficiency) and union the source provenance.
function mergeSkills(a: Skill[], b: Skill[]): Skill[] {
  const byKey = new Map<string, Skill & { sources: Set<string> }>();
  for (const s of [...a, ...b]) {
    const key = norm(s.name);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...s, sources: new Set([s.source]) });
    } else {
      existing.years = maxNum(existing.years, s.years);
      existing.proficiency = maxNum(existing.proficiency, s.proficiency);
      existing.category = existing.category || s.category;
      existing.last_used = existing.last_used || s.last_used;
      existing.sources.add(s.source);
    }
  }
  return Array.from(byKey.values()).map(({ sources, ...s }) => ({
    ...s,
    source: Array.from(sources).join("+"),
  }));
}

function mergeByKey<T>(a: T[], b: T[], keyOf: (x: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const key = keyOf(item);
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return Array.from(byKey.values());
}

// ─── embedding ──────────────────────────────────────────────────────────────
//
// Recompute the user's resume embedding from the inventory + resume_text so the
// cosine-ranked feed (feed.ts) reflects the richer structured signal. Writes to
// user_profiles.resume_embedding — the same column the feed already reads.

async function reembedFromInventory(env: Env, userId: string): Promise<void> {
  const inv = await loadInventory(env, userId);
  const prof = await env.DB.prepare(`SELECT resume_text, target_roles FROM user_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<{ resume_text: string | null; target_roles: string | null }>();

  const skillNames = inv.skills.map((s) => s.name).slice(0, 60);
  const titles = inv.experience.map((e) => e.title).filter(Boolean).slice(0, 12);
  const text = [
    (prof?.resume_text || "").slice(0, 4000),
    inv.summary ? `Summary: ${inv.summary}` : "",
    titles.length ? `Roles held: ${titles.join(", ")}` : "",
    skillNames.length ? `Skills: ${skillNames.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (text.trim().length < 50) return; // nothing meaningful yet

  // Ensure a profile row exists so the UPDATE lands.
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_profiles (user_id, created_at, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO NOTHING`,
  )
    .bind(userId, now, now)
    .run();

  const { vector, model } = await embedText(env.AI, text);
  if (!vector) return;
  await env.DB.prepare(
    `UPDATE user_profiles
        SET resume_embedding = ?, resume_embedding_updated_at = ?, resume_embedding_model = ?
      WHERE user_id = ?`,
  )
    .bind(packVector(vector), now, model, userId)
    .run();
}

// ─── persistence ────────────────────────────────────────────────────────────

async function loadInventory(env: Env, userId: string): Promise<Inventory> {
  const row = await env.DB.prepare(`SELECT * FROM user_inventory WHERE user_id = ?`)
    .bind(userId)
    .first<InventoryRow>();
  if (!row) {
    return { skills: [], experience: [], education: [], certifications: [], summary: null, total_years_experience: null, sources: [] };
  }
  return {
    skills: safeParse<Skill[]>(row.skills, []),
    experience: safeParse<Experience[]>(row.experience, []),
    education: safeParse<Education[]>(row.education, []),
    certifications: safeParse<Certification[]>(row.certifications, []),
    summary: row.summary,
    total_years_experience: row.total_years_experience,
    sources: safeParse<string[]>(row.sources, []),
    updated_at: row.updated_at,
  };
}

async function saveInventory(env: Env, userId: string, inv: Inventory): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_inventory
       (user_id, skills, experience, education, certifications, summary, total_years_experience, sources, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       skills = excluded.skills,
       experience = excluded.experience,
       education = excluded.education,
       certifications = excluded.certifications,
       summary = excluded.summary,
       total_years_experience = excluded.total_years_experience,
       sources = excluded.sources,
       updated_at = excluded.updated_at`,
  )
    .bind(
      userId,
      JSON.stringify(inv.skills),
      JSON.stringify(inv.experience),
      JSON.stringify(inv.education),
      JSON.stringify(inv.certifications),
      inv.summary,
      inv.total_years_experience,
      JSON.stringify(inv.sources),
      now,
      now,
    )
    .run();
}

// ─── normalizers ────────────────────────────────────────────────────────────

function normalizeSkills(raw: unknown, source: string): Skill[] {
  if (!Array.isArray(raw)) return [];
  const out: Skill[] = [];
  for (const item of raw) {
    if (!item) continue;
    const name = typeof item === "string" ? item : str((item as any).name);
    if (!name || name.length > 60) continue;
    const o = typeof item === "object" ? (item as any) : {};
    out.push({
      name: name.trim(),
      category: str(o.category) || null,
      years: cleanInt(o.years),
      proficiency: clampProf(o.proficiency),
      last_used: str(o.last_used) || null,
      source: typeof o.source === "string" ? o.source : source,
    });
    if (out.length >= 200) break;
  }
  return out;
}

function normalizeExperience(raw: unknown, source: string): Experience[] {
  if (!Array.isArray(raw)) return [];
  const out: Experience[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as any;
    const company = str(o.company);
    const title = str(o.title);
    if (!company && !title) continue;
    out.push({
      company,
      title,
      start: str(o.start) || null,
      end: str(o.end) || null,
      location: str(o.location) || null,
      highlights: Array.isArray(o.highlights)
        ? o.highlights.map((h: unknown) => str(h)).filter((h: string) => h.length > 0).slice(0, 8)
        : [],
      source: typeof o.source === "string" ? o.source : source,
    });
    if (out.length >= 60) break;
  }
  return out;
}

function normalizeEducation(raw: unknown): Education[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o === "object")
    .map((o: any) => ({
      school: str(o.school),
      degree: str(o.degree) || null,
      field: str(o.field) || null,
      start: str(o.start) || null,
      end: str(o.end) || null,
    }))
    .filter((e) => e.school)
    .slice(0, 20);
}

function normalizeCertifications(raw: unknown): Certification[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o === "object")
    .map((o: any) => ({ name: str(o.name), issuer: str(o.issuer) || null, date: str(o.date) || null }))
    .filter((c) => c.name)
    .slice(0, 40);
}

// ─── small utils ────────────────────────────────────────────────────────────

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}
function cleanInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function cleanNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function clampProf(v: unknown): number | null {
  const n = cleanInt(v);
  if (n == null) return null;
  return Math.max(1, Math.min(5, n));
}
function maxNum(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}
function splitHighlights(desc: unknown): string[] {
  const s = str(desc);
  if (!s) return [];
  return s
    .split(/\r?\n|•|·|;|(?:\.\s+)/)
    .map((x) => x.trim())
    .filter((x) => x.length > 3)
    .slice(0, 8);
}
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function parseJsonLoose(text: string): unknown {
  if (!text) return null;
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
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

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
