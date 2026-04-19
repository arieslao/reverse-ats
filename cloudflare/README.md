# Cloudflare Worker — Reverse ATS centralized ingest

Phase 0 of the cloud architecture. **Additive only** — does not replace
or modify the local single-tenant SQLite app. This Worker:

1. Receives scraped jobs from the GitHub Actions cron (`POST /ingest`)
2. Stores them in a shared D1 database
3. Uses Cloudflare Workers AI to extract structured fields
   (`@cf/meta/llama-3.1-8b-instruct`) and embed them
   (`@cf/baai/bge-m3`) — all on the free tier
4. Exposes `GET /jobs` and `GET /health` for verification

Validate it for ~2 weeks of real data before committing to Phase 1
(per-user data migration).

---

## One-time setup

Prerequisites: a Cloudflare account, a free tier is plenty.

```bash
cd cloudflare
npm install
npx wrangler login                    # opens browser, authenticates
```

### 1. Create the D1 database

```bash
npx wrangler d1 create reverse-ats-jobs
```

Wrangler prints something like:

```
[[d1_databases]]
binding = "DB"
database_name = "reverse-ats-jobs"
database_id = "abc123-..."
```

Paste the `database_id` value into `wrangler.toml` (replace
`REPLACE_WITH_D1_ID_AFTER_CREATE`).

### 2. Apply the schema

```bash
npx wrangler d1 migrations apply reverse-ats-jobs --remote
```

### 3. Set the ingest secret

Generate a random shared secret (any 32+ char value):

```bash
openssl rand -hex 32
```

Save it as a Worker secret AND in GitHub repo secrets (must match):

```bash
# Worker side
npx wrangler secret put INGEST_SECRET
# Paste the value when prompted
```

In the GitHub repo:
- Settings → Secrets and variables → Actions → New repository secret
  - `CF_INGEST_SECRET` = the same value you just used
  - `CF_INGEST_URL` = `https://reverse-ats-ingest.<your-cf-subdomain>.workers.dev/ingest`
    (you'll get this URL after the next step)

### 4. Deploy the Worker

```bash
npx wrangler deploy
```

Wrangler prints the live URL, e.g.
`https://reverse-ats-ingest.arieslao.workers.dev`. Add `/ingest` to that
URL and use it as the value of the `CF_INGEST_URL` GitHub secret.

### 5. Verify it's alive

```bash
curl https://reverse-ats-ingest.<your-subdomain>.workers.dev/health
```

Should return:

```json
{
  "ok": true,
  "total_jobs": 0,
  "total_preprocessed": 0,
  "total_embedded": 0,
  "last_ingest_at": null,
  "last_ingest_jobs": null
}
```

### 6. Trigger the GitHub Action manually

GitHub repo → Actions tab → "scrape-and-upload" → "Run workflow".
After it completes (~15-25 min), re-check `/health` — `total_jobs`
should be a real number and `total_preprocessed` should start
climbing on subsequent cron ticks.

---

## Local dev

```bash
cd cloudflare
npx wrangler dev
```

Runs the Worker on `localhost:8787` against a local D1 (file in
`.wrangler/state/v3/d1/`). Use `--remote` to hit the live D1 instead.

```bash
# Apply migrations to local D1
npm run db:migrate:local

# Test the ingest endpoint locally (set INGEST_SECRET in .dev.vars first)
curl -X POST http://localhost:8787/ingest \
  -H "Authorization: Bearer YOUR_LOCAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual", "jobs": []}'
```

Create `.dev.vars` (gitignored) for local secrets:

```
INGEST_SECRET=your-local-test-secret
```

---

## Costs

At 1000 active users on the free tier:

| Resource | Free tier | Estimated usage | Status |
|---|---|---|---|
| Workers requests | 100K/day | ~50K | ✓ |
| Workers AI neurons | 10K/day | ~7K | ✓ |
| D1 storage | 5 GB | ~2 GB | ✓ |
| D1 reads | 25M/day | ~200K | ✓ |
| D1 writes | 100K/day | ~50K | ✓ |

Validate by watching `/health` and the Cloudflare dashboard usage
graphs over the first 2 weeks.

### Per-user cost at $10 flat tier

Even with every roadmap feature turned on (chatbot, cover letters in
5 styles, interview prep, salary coach, multi-resume), heavy-user
compute cost is **~$0.05/user/month**. At $10/mo revenue that's a
99.5% margin. Detailed breakdown in [`backlog.md`](../backlog.md#hard-cost-safeguards-bake-into-phase-1).

---

## Cost safeguards (must be enforced from Phase 1 onward)

Bootstrap-friendly hard ceilings to ensure the unit economics never
break, even under abuse or unexpected viral growth:

| Safeguard | Cap | Why |
|---|---|---|
| Per-user daily neuron cap | **2,000 neurons/day** | Single kill switch — prevents one user from eating the free tier. Worst case: $0.66/user/mo. |
| Chatbot context size | **4K tokens/turn**, last 10 turns | Long convos stay cheap; no unbounded context growth |
| Cover letter generation | **5/day per user** | Real users apply to 5-10 jobs/week max |
| Detailed re-scoring (premium model) | **100/day per user** | Bounds Llama 70B usage |
| Interview prep generation | **10/day per user** | Way more than anyone needs |
| Per-IP rate limit | **30 req/min** | Anti-abuse / anti-DoS |
| Cloudflare account spend alert | Email at $25/mo | Margin protection |
| Cloudflare account hard stop | Auto-throttle at $50/mo | Catastrophic failsafe |
| Model whitelist | Only `@cf/...` models we've costed | Prevents accidental enabling of expensive models |
| Lazy preprocessing | Only preprocess jobs filtered/viewed | Saves 80% of preprocess compute |
| Background scoring gate | Only for users active in past 14 days | Saves ~30% scoring compute |

Implement in Phase 1 alongside the multi-tenant API — easier to bake
in upfront than retrofit after launch.

---

## Useful commands

```bash
npm run tail                                    # live logs
npm run db:migrate:remote                       # apply new migrations
wrangler d1 execute reverse-ats-jobs --remote --command "SELECT COUNT(*) FROM jobs"
wrangler d1 execute reverse-ats-jobs --remote --command "SELECT * FROM ingest_runs ORDER BY id DESC LIMIT 5"
```
