// Job preprocessing — extract structured fields from a raw job description
// using Llama 3.1 8B via Cloudflare Workers AI. Runs once per new job and
// writes to jobs_structured. Compact output dramatically shrinks the prompt
// size for per-user scoring later.

import type { Ai } from "@cloudflare/workers-types";
import type { StructuredJob } from "./schema";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

const SYSTEM_PROMPT = `You extract structured information from job postings.

Read the posting carefully and output ONLY valid JSON in this exact shape:

{
  "seniority": "<one of: junior, mid, senior, principal, staff, director, vp, c_level, or null if unclear>",
  "years_experience_min": <integer or null>,
  "must_have_skills": ["<skill1>", "<skill2>", ... up to 12],
  "nice_to_have_skills": ["<skill1>", ...],
  "responsibilities": ["<short bullet1>", "<short bullet2>", ... up to 6],
  "comp_min": <integer USD annual or null>,
  "comp_max": <integer USD annual or null>,
  "remote_policy": "<one of: full_remote, hybrid, onsite, not_specified>",
  "industry_tags": ["<tag1>", "<tag2>", ... up to 4]
}

Rules:
- Skills must be specific (e.g. "Python", "PyTorch", "SQL"), not vague (not "programming")
- Responsibilities must be concise — under 12 words each, action-verb first
- For comp_min/comp_max, parse only explicit annual base salary in USD; equity / bonus / range with unclear units = null
- For industry_tags use lowercase snake_case (e.g. "fintech", "ai_ml", "healthcare")
- Output JSON only — no prose, no markdown fences
`;

export async function preprocessJob(
  ai: Ai,
  job: { title: string; company: string; description_full?: string | null; description_snippet?: string | null },
): Promise<{ structured: StructuredJob | null; error: string | null; model: string }> {
  const description = job.description_full || job.description_snippet || "";
  if (!description.trim()) {
    return {
      structured: null,
      error: "no description text to preprocess",
      model: MODEL,
    };
  }

  const userPrompt =
    `Job posting:\n\n` +
    `Title: ${job.title}\n` +
    `Company: ${job.company}\n` +
    `Description:\n${description.slice(0, 6000)}\n\n` +
    `Extract structured fields per the system instructions.`;

  try {
    // Cloudflare Workers AI binding — same shape across all chat models.
    const response = (await ai.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.1,
    })) as { response?: string };

    const raw = (response.response || "").trim();
    const parsed = parseJsonLoose(raw);
    if (!parsed) {
      return { structured: null, error: `model returned unparseable JSON: ${raw.slice(0, 200)}`, model: MODEL };
    }
    return { structured: normalize(parsed), error: null, model: MODEL };
  } catch (err) {
    return {
      structured: null,
      error: `AI call failed: ${err instanceof Error ? err.message : String(err)}`,
      model: MODEL,
    };
  }
}

// Some models wrap output in ```json fences or prose preamble. Try direct
// parse first, then extract the first {...} block.
function parseJsonLoose(text: string): unknown {
  if (!text) return null;
  let cleaned = text.trim();
  // Strip code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback — find first balanced object
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

// Coerce types + clip array sizes; never trust raw model output.
function normalize(raw: any): StructuredJob {
  const cleanArr = (v: unknown, max: number): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((s) => s.length > 0 && s.length < 80)
      .slice(0, max);
  };
  const cleanInt = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const cleanStr = (v: unknown, allowed?: string[]): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim().toLowerCase();
    if (!s) return null;
    if (allowed && !allowed.includes(s)) return null;
    return s;
  };

  return {
    seniority: cleanStr(raw.seniority, [
      "junior", "mid", "senior", "principal", "staff", "director", "vp", "c_level",
    ]),
    years_experience_min: cleanInt(raw.years_experience_min),
    must_have_skills: cleanArr(raw.must_have_skills, 12),
    nice_to_have_skills: cleanArr(raw.nice_to_have_skills, 12),
    responsibilities: cleanArr(raw.responsibilities, 6),
    comp_min: cleanInt(raw.comp_min),
    comp_max: cleanInt(raw.comp_max),
    remote_policy: cleanStr(raw.remote_policy, [
      "full_remote", "hybrid", "onsite", "not_specified",
    ]),
    industry_tags: cleanArr(raw.industry_tags, 4),
  };
}

export const PREPROCESS_MODEL = MODEL;
