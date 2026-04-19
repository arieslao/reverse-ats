// Vector embeddings for jobs — feeds the cosine pre-filter that Phase 6
// will use to pick the top-K candidates for per-user scoring (avoiding
// the per-(user, job) blowup that kills naive scoring at scale).
//
// We embed the STRUCTURED summary, not the raw description, so the vector
// captures what's actually relevant (skills, responsibilities, seniority)
// rather than boilerplate (EEO, "About us", benefits).

import type { Ai } from "@cloudflare/workers-types";
import type { StructuredJob } from "./schema";

// bge-m3 is on Cloudflare's free tier and returns 1024-dim float vectors.
const EMBED_MODEL = "@cf/baai/bge-m3";
const EMBED_DIM = 1024;

export async function embedStructuredJob(
  ai: Ai,
  job: { title: string; company: string },
  structured: StructuredJob,
): Promise<{ vector: Float32Array | null; error: string | null; model: string }> {
  // Compose a compact, signal-dense text to embed.
  const text = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    structured.seniority ? `Seniority: ${structured.seniority}` : "",
    structured.years_experience_min
      ? `Experience: ${structured.years_experience_min}+ years`
      : "",
    structured.must_have_skills.length
      ? `Required skills: ${structured.must_have_skills.join(", ")}`
      : "",
    structured.nice_to_have_skills.length
      ? `Nice-to-have: ${structured.nice_to_have_skills.join(", ")}`
      : "",
    structured.responsibilities.length
      ? `Responsibilities: ${structured.responsibilities.join("; ")}`
      : "",
    structured.industry_tags.length
      ? `Industry: ${structured.industry_tags.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!text.trim()) {
    return { vector: null, error: "no signal to embed", model: EMBED_MODEL };
  }

  try {
    const response = (await ai.run(EMBED_MODEL, { text: [text] })) as {
      data?: number[][];
    };
    const vec = response.data?.[0];
    if (!vec || vec.length !== EMBED_DIM) {
      return {
        vector: null,
        error: `unexpected embed dim: ${vec?.length} (expected ${EMBED_DIM})`,
        model: EMBED_MODEL,
      };
    }
    return { vector: new Float32Array(vec), error: null, model: EMBED_MODEL };
  } catch (err) {
    return {
      vector: null,
      error: `embed call failed: ${err instanceof Error ? err.message : String(err)}`,
      model: EMBED_MODEL,
    };
  }
}

// Pack/unpack — D1 stores BLOBs; we use little-endian float32 raw.
export function packVector(v: Float32Array): ArrayBuffer {
  return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
}

export function unpackVector(buf: ArrayBuffer): Float32Array {
  return new Float32Array(buf);
}

export const EMBEDDING_MODEL = EMBED_MODEL;
export const EMBEDDING_DIM = EMBED_DIM;
