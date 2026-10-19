# scripts/

## `la_companies_to_local_sqlite.py` + `la_companies.yaml` + `job_lanes.py`

Fifth local job source (2026-10-18), owner-supplied: "LA Based Company Career
Site List.csv" — 47 named LA-area employers across Big Tech/Media, Defense &
Hard Tech, Frontier Labs/Robotics/Biotech, Enterprise SaaS/Fintech/Consumer,
Gaming Studios, and High-Growth Startups. `la_companies.yaml` pins each one
to its resolved public ATS board — Greenhouse, Lever, Ashby, SmartRecruiters,
Workday, plus two bespoke fetchers this loader adds (`amazon_jobs` for Ring,
scoped by `amazon_query`; `eightfold` for Netflix, which moved off
Greenhouse). Every entry was verified by a LIVE API probe before being added
(a 200-with-empty-array response is not proof — Greenhouse, Lever and Ashby
all do this for a wrong slug just like SmartRecruiters does; cross-check
against the company's own careers-page HTML). 34 of 47 resolved to a real
board; the other 13 sit in `excluded:` with the reason (true custom in-house
ATS like Apple/Meta/Microsoft/Google/TikTok, email-only apply, or a splash
page with no careers content at all).

Unlike IA40/YC's pre-filtered lists, these are GENERAL company-wide boards
(SpaceX ~2,700 jobs, Anduril ~2,500), so a title LANE filter
(`job_lanes.py`, shared with the YC loader's default) runs first, before the
location gate or any detail fetch. Workday listings carry an upstream bug —
everything from the fetcher's `searchText="remote"` pass gets flagged
`remote=True` even when the job is onsite elsewhere — so this loader
recomputes `remote` from the location text alone before the gate runs.
Workday and Eightfold (Netflix) listings arrive with no description; this
loader fetches each NEW surviving job's detail page, bounded by
`LA_MAX_DETAIL` (default 120/run) — the same bounded pattern the YC loader
uses. (Fixed a real bug in `scraper/job_scraper.py`'s `_fetch_workday_job_detail`
while building this: it double-prefixed `/job/job/...` and always returned
None; `externalPath` from the listing API already starts with `/job/...`.)

Wired into `local_daily_digest.py` (pull-la-companies) and
`POST /api/scrape/trigger`. Filters: `LA_TITLE_REGEX` / `LA_TITLE_EXCLUDE`
(defaults from `job_lanes.py`), the shared location gate (remote or
LA/OC metro — `indeed_to_local_sqlite.py`'s `passes_location_gate`).

```bash
python3 scripts/la_companies_to_local_sqlite.py --dry-run        # fetch+filter, no writes
python3 scripts/la_companies_to_local_sqlite.py                  # load into local SQLite
python3 scripts/la_companies_to_local_sqlite.py --all-locations  # skip the location gate
```

To add a company later: probe Greenhouse (`boards-api.greenhouse.io/v1/boards/<slug>/jobs`),
Lever (`api.lever.co/v0/postings/<slug>?mode=json`), Ashby
(`api.ashbyhq.com/posting-api/job-board/<slug>`) or SmartRecruiters
(`api.smartrecruiters.com/v1/companies/<slug>/postings`) directly; for
Workday, find the `*.myworkdayjobs.com` tenant/host/site from the company's
careers page and add a `workday: {tenant, host, site}` block. A 404 means
wrong slug; a 200 with zero jobs can still mean wrong slug (check the
company's own page for the real one before trusting it).

## `yc_to_local_sqlite.py`

Fourth local job source (2026-10-16): the Y Combinator "Work at a Startup"
board, https://www.ycombinator.com/jobs/role/<role>. The role pages are
server-rendered Inertia pages; the loader reads the `data-page` JSON payload
(`jobPostings`: title, location, salary/equity, min experience, company,
batch) and fetches each NEW job's page for its markdown description. Reading
needs no login; applying does, so rows land with `ats=None`, `ats_type="yc"`,
and `apply_url` = the job page (manual fallback, like Indeed rows). The
resolver may later map the company to a public Greenhouse/Ashby/Lever board.

Filters: title lane regex (`YC_TITLE_REGEX`, default covers program/product/
ops/solutions/CS/chief-of-staff lanes; '' disables) → US or unspecified
country → the shared location gate (remote, or hybrid/on-site in
`config/local_metro.json`). Roles read: `YC_ROLES` (default product-manager,
operations, sales-manager, support, software-engineer, recruiting-hr).

Wired into `local_daily_digest.py` (pull-yc) and `POST /api/scrape/trigger`.

```bash
python3 scripts/yc_to_local_sqlite.py --dry-run        # fetch+filter, no writes
python3 scripts/yc_to_local_sqlite.py                  # load into local SQLite
python3 scripts/yc_to_local_sqlite.py --all-locations  # skip the location gate
```

## `ia40_to_local_sqlite.py` + `ia40_companies.yaml`

Third local job source (next to `rfj_to_local_sqlite.py` and
`indeed_to_local_sqlite.py`): the IA40 list (https://www.ia40.com/the-list),
~48 top AI startups. `ia40_companies.yaml` pins each company to its resolved
public ATS board (39 Ashby + 5 Greenhouse as of 2026-09-03; 4 companies have
no public board and sit in the `excluded:` section with reasons).

The loader fetches every board via `scraper/job_scraper.py` fetchers, keeps
only fully-remote roles (Ashby `workplaceType` when present, else an explicit
"remote" location + the phrase gate shared with the Indeed loader), collapses
same company+title duplicates across sources, and upserts via `db.upsert_job`
with `ats_type="ia40"`. Rows arrive pre-resolved (`apply_url`/`ats`/`ats_slug`
stamped), so `ats_resolver.py` skips them and the apply agent can autofill.

Wired into `POST /api/scrape/trigger` (backend/api.py) and the daily digest
(`local_daily_digest.py`) — no extra cron needed. Typical volume: ~6.8k jobs
fetched, ~480 pass the remote gate.

```bash
python3 scripts/ia40_to_local_sqlite.py --dry-run       # fetch+filter, no writes
python3 scripts/ia40_to_local_sqlite.py                 # load into local SQLite
python3 scripts/ia40_to_local_sqlite.py --all-locations # skip the remote gate
```

The IA40 list refreshes annually — re-probe boards and regenerate the yaml
when the new list drops (or when a company's board 404s).

## `scrape_workday_gx10.py`

Workday-only scrape that runs on GX10 (residential IP) instead of GitHub
Actions, where Akamai bot detection soft-blocks the entire Microsoft
Azure datacenter range.

The script reuses `scraper/job_scraper.py:fetch_workday()` and
`backend/d1_uploader.py:push_jobs()`, so its output is indistinguishable
from a normal GitHub Actions ingest. The Worker upserts by `job_id`, so
both pipelines can run concurrently without conflict.

### One-time setup on GX10

GX10 is on Debian 12+ with PEP 668 (externally-managed-environment),
so we use a repo-local venv rather than `--user` or system pip.

```bash
# 1. Clone (or pull) the repo somewhere persistent
ssh aries-gpu
cd /mnt/crucial-x10/projects
git clone https://github.com/arieslao/reverse-ats.git    # or `git pull` if already there
cd reverse-ats

# 2. Create a repo-local venv and install requirements
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r backend/requirements.txt

# 3. Make sure the log directory exists
mkdir -p /mnt/crucial-x10/projects/reverse-ats/logs

# 4. Smoke-test the script with a manual run BEFORE adding cron
CF_INGEST_URL=https://reverse-ats-ingest.aries-lao.workers.dev/ingest \
CF_INGEST_SECRET=<the-secret> \
.venv/bin/python scripts/scrape_workday_gx10.py
```

You should see one INFO line per Workday tenant ("NVIDIA: 555 jobs (46s)"
etc.) and a final `ingest complete: sent=N new=M updated=K errors=0`.

### Cron entry (use safe-crontab per CLAUDE.md)

```bash
# Append to existing crontab (NEVER rewrite — see CLAUDE.md)
crontab -l > /tmp/ct.txt
cat >> /tmp/ct.txt <<'EOF'
# Reverse ATS — Workday-only scrape from residential IP (Akamai blocks GH Actions)
*/30 * * * * cd /mnt/crucial-x10/projects/reverse-ats && CF_INGEST_URL=https://reverse-ats-ingest.aries-lao.workers.dev/ingest CF_INGEST_SECRET=<the-secret> .venv/bin/python scripts/scrape_workday_gx10.py >> /mnt/crucial-x10/projects/reverse-ats/logs/workday_scrape.log 2>&1
EOF
safe-crontab /tmp/ct.txt

# Update the reference per CLAUDE.md
crontab -l > /mnt/crucial-x10/projects/Infrastructure/crontab-backups/arieslao_reference.crontab
```

### What to expect

After the first run, `wrangler d1 execute reverse-ats-jobs --remote --command "SELECT company, COUNT(*) FROM jobs WHERE expired = 0 AND company IN ('NVIDIA','CVS Health','Humana','Walmart','Disney','Citi','Salesforce') GROUP BY company"` should return non-zero counts. Roughly:

| Tenant | Expected jobs |
|---|---|
| NVIDIA | ~500 |
| CVS Health | ~450 |
| Humana | ~300 |
| Walmart | ~580 |
| Disney | ~320 |
| Citi | ~430 |
| Salesforce | ~460 |

After the title filter and Workers AI preprocessing (every 30 min), only
the engineering/AI/product roles will surface in the feed — typically
~10-20% of raw counts above.

### Safety / discipline

- The script **refuses to run** if `CF_INGEST_URL` or `CF_INGEST_SECRET`
  is missing — won't accidentally hit the wrong endpoint.
- If the scrape returns zero jobs across all tenants, the script exits
  with a non-zero code and does **not** POST an empty payload (so we
  notice via cron mail / log inspection if Workday changes the API).
- Tenant-level errors are logged but non-fatal; one tenant going down
  doesn't kill the run for the others.
