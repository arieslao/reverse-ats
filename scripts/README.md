# scripts/

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
