# scripts/

## `scrape_workday_gx10.py`

Workday-only scrape that runs on GX10 (residential IP) instead of GitHub
Actions, where Akamai bot detection soft-blocks the entire Microsoft
Azure datacenter range.

The script reuses `scraper/job_scraper.py:fetch_workday()` and
`backend/d1_uploader.py:push_jobs()`, so its output is indistinguishable
from a normal GitHub Actions ingest. The Worker upserts by `job_id`, so
both pipelines can run concurrently without conflict.

### One-time setup on GX10

```bash
# 1. Clone (or pull) the repo somewhere persistent
ssh aries-gpu
cd /mnt/crucial-x10/projects
git clone https://github.com/arieslao/reverse-ats.git    # or `git pull` if already there
cd reverse-ats

# 2. Install Python deps the script needs (from the existing requirements file)
pip install --user -r backend/requirements.txt

# 3. Make sure the log directory exists
mkdir -p /mnt/crucial-x10/projects/reverse-ats/logs

# 4. Smoke-test the script with a manual run BEFORE adding cron
CF_INGEST_URL=https://reverse-ats-ingest.aries-lao.workers.dev/ingest \
CF_INGEST_SECRET=<the-secret> \
python3 scripts/scrape_workday_gx10.py
```

You should see one INFO line per Workday tenant ("NVIDIA: 555 jobs (46s)"
etc.) and a final `ingest complete: sent=N new=M updated=K errors=0`.

### Cron entry (use safe-crontab per CLAUDE.md)

```bash
# Append to existing crontab (NEVER rewrite — see CLAUDE.md)
crontab -l > /tmp/ct.txt
cat >> /tmp/ct.txt <<'EOF'
# Reverse ATS — Workday-only scrape from residential IP (Akamai blocks GH Actions)
*/30 * * * * cd /mnt/crucial-x10/projects/reverse-ats && CF_INGEST_URL=https://reverse-ats-ingest.aries-lao.workers.dev/ingest CF_INGEST_SECRET=<the-secret> python3 scripts/scrape_workday_gx10.py >> /mnt/crucial-x10/projects/reverse-ats/logs/workday_scrape.log 2>&1
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
