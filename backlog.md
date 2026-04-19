# Backlog

Features approved in planning but parked for after the Phase 0–7 cloud rewrite ships.

---

## Interview prep + role-specific Q&A (Pro tier feature)

**Trigger:** When a user moves a job from `applied` → `phone_screen` (or any later stage) in their Pipeline.

**Generates:**
- ~10 likely interview questions specific to the role + company (from job description, company news, common interview patterns for this seniority)
- 3 example STAR-format answers using the user's actual resume highlights
- Company research brief — recent news, products, tech stack, leadership team
- Salary negotiation talking points based on the user's target salary + the job's comp range

**Architecture fits the existing model:**
- Inputs: structured job (already in `jobs_structured`) + user resume
- Models: Llama 3.3 70B for generation + QwQ 32B for STAR reasoning
- Cost: ~50 neurons/job → ~$0.0006 per generated prep — negligible
- Storage: new `interview_prep` table keyed by `(user_id, job_id)`
- UI: panel that appears on the Pipeline card when stage advances

**Why it's powerful:**
- Compounds with everything else (uses resume, profile, scraped job data, structured fields)
- Massive perceived value at low marginal cost
- Differentiates Pro tier — natural reason to upgrade once you start interviewing

**Estimated effort:** 1 week of focused work after Phase 7 ships.

---

## Other ideas worth keeping (lower priority)

- **Salary negotiation coach** — once an offer arrives, generate a 3-round negotiation script using levels.fyi data + their target.
- **Resume gap analysis** — per-job: "this job wants Kubernetes, your resume mentions Docker but not K8s. Here's how to bridge that on the application."
- **Application reminders** — gentle nudges based on Pipeline stage age ("Applied 14 days ago, follow up?").
- **Referral finder** — "you know X person who works at Y company on LinkedIn — here's a draft warm-intro message."
- **Multi-resume support** — different roles want different resume framing (e.g. "AI eng resume" vs "engineering manager resume").
