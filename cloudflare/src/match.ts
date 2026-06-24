// Deterministic gap matcher — Phase 3.
//
// Compares a job's structured requirements (must-have / nice-to-have skills,
// years of experience) against the user's structured inventory and produces a
// per-job breakdown of what they MEET vs. what's MISSING — the "where you're
// strong, where you have gaps" readout the feed surfaces.
//
// Pure string logic on purpose: no per-job LLM call, no embedding lookups, so
// it's free and instant for every job on every page. Synonyms are handled with
// a normalized form + a small alias table + token-subset matching (so
// "React.js" ↔ "React", "K8s" ↔ "Kubernetes", "JS" ↔ "JavaScript").

export interface MatchBreakdown {
  required_met: string[];
  required_missing: string[];
  nice_met: string[];
  nice_missing: string[];
  required_total: number;
  years_required: number | null;
  years_have: number | null;
  years_gap: number | null;     // >0 means short by this many years
  coverage_pct: number;          // % of required skills met (0-100)
  fit_label: "strong" | "good" | "stretch" | "reach";
  strengths: string[];
  gaps: string[];
}

// Common abbreviation / spelling equivalences. Keys and values are normalized.
const ALIASES: Record<string, string[]> = {
  js: ["javascript"],
  javascript: ["js"],
  ts: ["typescript"],
  typescript: ["ts"],
  py: ["python"],
  k8s: ["kubernetes"],
  kubernetes: ["k8s"],
  gcp: ["google cloud", "google cloud platform"],
  aws: ["amazon web services"],
  ml: ["machine learning"],
  ai: ["artificial intelligence"],
  nlp: ["natural language processing"],
  postgres: ["postgresql"],
  postgresql: ["postgres"],
  node: ["nodejs", "node js"],
  nodejs: ["node", "node js"],
  react: ["reactjs", "react js"],
  reactjs: ["react", "react js"],
  cicd: ["ci cd", "continuous integration"],
  tf: ["terraform"],
  golang: ["go"],
  dotnet: ["net", "c#", "csharp"],
  csharp: ["c#"],
};

export interface UserSkillIndex {
  // normalized full skill -> true
  exact: Set<string>;
  // every significant token across all user skills
  tokens: Set<string>;
  years: number | null;
  size: number;
}

export function buildUserSkillIndex(
  skills: Array<{ name: string }>,
  totalYears: number | null,
): UserSkillIndex {
  const exact = new Set<string>();
  const tokens = new Set<string>();
  for (const s of skills) {
    const n = norm(s.name);
    if (!n) continue;
    exact.add(n);
    for (const alias of ALIASES[n] || []) exact.add(norm(alias));
    for (const t of sigTokens(n)) tokens.add(t);
  }
  return { exact, tokens, years: totalYears, size: exact.size };
}

// Does the user have this single job skill?
function userHas(jobSkill: string, idx: UserSkillIndex): boolean {
  const n = norm(jobSkill);
  if (!n) return false;
  if (idx.exact.has(n)) return true;
  // alias expansion of the job skill
  for (const alias of ALIASES[n] || []) {
    if (idx.exact.has(norm(alias))) return true;
  }
  // token-subset: every significant token of the job skill is somewhere in the
  // user's skills (handles "React" vs "React.js", "AWS Lambda" vs "AWS").
  const jt = sigTokens(n);
  if (jt.length > 0 && jt.every((t) => idx.tokens.has(t))) return true;
  return false;
}

export function computeMatchBreakdown(
  structured: {
    must_have_skills: string[];
    nice_to_have_skills: string[];
    years_experience_min: number | null;
  },
  idx: UserSkillIndex,
): MatchBreakdown {
  const required = dedupe(structured.must_have_skills);
  const nice = dedupe(structured.nice_to_have_skills);

  const required_met: string[] = [];
  const required_missing: string[] = [];
  for (const s of required) (userHas(s, idx) ? required_met : required_missing).push(s);

  const nice_met: string[] = [];
  const nice_missing: string[] = [];
  for (const s of nice) (userHas(s, idx) ? nice_met : nice_missing).push(s);

  const required_total = required.length;
  const coverage_pct =
    required_total === 0 ? 100 : Math.round((required_met.length / required_total) * 100);

  const years_required = structured.years_experience_min ?? null;
  const years_have = idx.years ?? null;
  let years_gap: number | null = null;
  if (years_required != null && years_have != null) {
    years_gap = Math.max(0, years_required - years_have);
  }

  // Strengths = required skills met (the things that make them a fit) plus any
  // nice-to-haves they bring. Gaps = missing required first, then years, then
  // missing nice-to-haves.
  const strengths: string[] = [...required_met];
  for (const s of nice_met) if (strengths.length < 8) strengths.push(s);

  const gaps: string[] = [...required_missing];
  if (years_gap && years_gap > 0) gaps.push(`${years_gap}+ yrs experience`);
  for (const s of nice_missing) if (gaps.length < 8) gaps.push(s);

  const fit_label = labelFit(coverage_pct, required_total, years_gap);

  return {
    required_met,
    required_missing,
    nice_met,
    nice_missing,
    required_total,
    years_required,
    years_have,
    years_gap,
    coverage_pct,
    fit_label,
    strengths,
    gaps: gaps.slice(0, 10),
  };
}

function labelFit(
  coverage: number,
  requiredTotal: number,
  yearsGap: number | null,
): MatchBreakdown["fit_label"] {
  // No declared requirements → can't judge coverage; treat as "good".
  if (requiredTotal === 0) return "good";
  const yearShort = yearsGap != null && yearsGap >= 3;
  if (coverage >= 85 && !yearShort) return "strong";
  if (coverage >= 60) return yearShort ? "stretch" : "good";
  if (coverage >= 35) return "stretch";
  return "reach";
}

// ─── normalization ──────────────────────────────────────────────────────────

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\+\+/g, "pp") // c++ -> cpp-ish so it tokenizes
    .replace(/[^a-z0-9#.+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Stop-tokens that carry no matching signal.
const STOP = new Set(["and", "or", "the", "of", "in", "with", "a", "to", "for", "js"]);

function sigTokens(normalized: string): string[] {
  return normalized
    .split(/[\s.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr || []) {
    const v = (s || "").trim();
    if (!v) continue;
    const k = norm(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}
