# Backlog

Roadmap for Reverse ATS — the cloud rewrite (Phases 0–7) and post-launch features.

**Pricing model: single $10/mo flat tier** (set 2026-04-19). Self-host stays free forever; everything else is bundled into one Hosted tier with no Pro/Lite split. Per-feature cost analysis shows ~$0.05/user/mo at heavy use, leaving 99%+ margin at any scale.

---

## Phase 1.5 — Coverage + Dedup (next)

The whole value prop at $10 flat is **"we find more jobs than anyone else AND show you each one only once."** Today we cover ~220 companies on 4 ATS types and dedup only on exact `hash(company+title+url)` matches — that misses cross-source duplicates and a huge chunk of the job market.

### A. Coverage expansion (~2-3 days)

Each new source unlocks more companies/jobs without adding scraper-side risk:

| Source | New companies/jobs | Effort | Notes |
|---|---|---|---|
| **SmartRecruiters API** | ~500 (Twilio, Atlassian, Square, IKEA) | 2 hrs | Public, no auth |
| **Workable API** | ~300 (YC startups) | 2 hrs | Public, no auth |
| **BambooHR** | ~200 (smaller companies) | 3 hrs | Partial public API |
| **Recruitee** | ~150 (European-heavy) | 2 hrs | Public |
| **Adzuna aggregator** | 5,000-10,000 jobs across categories | 3 hrs | Free 1k calls/mo |
| **USAJobs.gov** | ~30,000 federal jobs | 1 hr | Official US gov API |
| **WeWorkRemotely RSS** | ~500 remote-only | 1 hr | RSS feed |

**Target after Phase 1.5: 8,000-15,000 active jobs/day** (up from ~2,000 today).

### B. Dedup hardening (~2 days, mostly leveraging Phase 0)

Phase 0 already produces bge-m3 embeddings of every structured job — we just need to use them:

| Layer | Catches |
|---|---|
| Hash dedup *(have)* | Same job, same source, scraped twice |
| **Normalized hash** *(add)* | "Coinbase Inc" + "Coinbase" + "coinbase, inc." → 1 |
| **Semantic dedup** *(add)* | Cosine similarity > 0.92 → "Senior ML Engineer at Stripe" via Greenhouse + LinkedIn + Indeed → 1 |
| **Cross-source preference** *(add)* | When dupes found, keep the one with the most reliable URL (direct ATS > aggregator) |

The semantic dedup is what makes adding aggregator APIs (which produce TONS of duplicates) safe. Without it, Adzuna would 5x the noise.

### C. Community-driven expansion (~1 day, ongoing)

- `companies.yaml` in repo, accept PRs for new company additions
- Auto-disable companies with 0 results × 7 days (self-cleaning)
- Per-user company list (Phase 2 — let users add their dream targets)

---

## Phase-1.5+ post-launch features (all included in $10 Hosted tier)

These all fit comfortably under the per-user-per-month cost model. None require a Pro tier.

### Interview prep + role-specific Q&A
**Trigger:** when a user moves a job from `applied` → `phone_screen` (or any later stage) in their Pipeline.

**Generates:**
- ~10 likely interview questions specific to the role + company
- 3 example STAR-format answers using the user's actual resume highlights
- Company research brief (recent news, products, tech stack, leadership team)
- Salary negotiation talking points based on user's target + job's comp range

**Models:** Llama 3.3 70B for generation, QwQ 32B for STAR reasoning. Cost: ~$0.003 per active user/month. Storage: new `interview_prep` table keyed by `(user_id, job_id)`.

### Cover letter styles (5 variations)
Concise / Standard / Detailed / Casual / Bulleted — picker on Pipeline cards. Llama 3.3 70B for generation. Cost: ~$0.006/user/mo at heavy use.

### Chatbot — career assistant
Conversational interface for "explain this job to me", "draft a follow-up message", "what should I ask in the interview?", etc. Bounded context (4K tokens history per turn) keeps cost at ~$0.006/user/mo even for heavy chatters. Daily message cap (50/user/day) prevents abuse.

### Resume gap analysis (per job)
"This job wants Kubernetes, your resume mentions Docker but not K8s. Here's how to bridge that on the application." Cost: ~$0.003/user/mo.

### Salary negotiation coach
When an offer arrives, generate a 3-round negotiation script using levels.fyi data + the user's target. Cost: ~$0.003/user/mo.

### Application reminders
Gentle nudges based on Pipeline stage age ("Applied 14 days ago, follow up?"). Cost: $0 (templating only).

### Referral / intro drafter
"You know X person who works at Y company on LinkedIn — here's a draft warm-intro message." Cost: ~$0.002/user/mo.

### Multi-resume support
Different role targets want different resume framing (AI eng resume vs engineering manager resume). Per-user storage of N resumes; scoring runs against the active one. Cost: ~$0.005/user/mo.

### Daily digest email
Top 5 new high-score jobs delivered each morning. Cost: $0 (Resend free tier covers 3K emails/day).

---

## Hard cost safeguards (bake into Phase 1)

To protect the bootstrap, these are non-negotiable from day one:

| Safeguard | What it does | Cap |
|---|---|---|
| Per-user daily neuron cap | Hard kill switch per account | **2,000 neurons/day** (= ~$0.66/user/mo even at full burn) |
| Chatbot context limit | History truncation | **4K tokens/turn**, last 10 turns |
| Daily cover letter cap | Per user | **5/day** (real use is 1-2/week) |
| Daily detailed-score cap | Per user | **100/day** (premium model usage) |
| Daily interview-prep cap | Per user | **10/day** |
| Per-IP rate limit | Anti-abuse | 30 req/min |
| Cloudflare account spend alert | Email at $25/mo, hard stop at $50/mo | Margin protection |
| Model whitelist | Only allow specific @cf/ models | Prevents accidental enabling of expensive models |
| Lazy preprocessing | Only preprocess jobs that someone actually views/filters | Saves 80% of preprocess compute |
| Background scoring only for active users | Skip users not logged in past 14 days | Saves ~30% of scoring compute |

---

## Out-of-scope (don't build for the $10 flat tier)

These would either compromise margins or open legal/TOS risk:

| Feature | Why we skip |
|---|---|
| Image generation (custom cover letter PDFs with branding) | $0.04+ per image — would 10x our compute line |
| Voice / mock interview audio | TTS is $0.10/min — bandwidth-heavy too |
| Live video resume coaching | Compute + bandwidth-heavy |
| Human review of cover letters | Your time isn't $0 |
| Crawling jobs beyond ATS APIs (full Playwright) | Compute cost compounds + TOS/legal risk |

If any of these become high-demand later, they'd be one-time add-ons (e.g. $5 per AI mock interview), not bundled into the $10 tier.
