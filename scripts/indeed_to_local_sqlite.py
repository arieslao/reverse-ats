#!/usr/bin/env python3
"""Load Indeed jobs into the LOCAL SQLite DB (private GX10 instance).

Indeed has no free keyed jobs API; the only access we have is the
claude.ai-hosted Indeed MCP, which is *interactively authenticated* and only
reachable from an interactive Claude session (NOT a headless GX10 cron). So
this lane is fed by hand-off: an interactive Claude session searches Indeed,
pulls full job details, writes them to a JSON file in the standard Indeed shape,
and runs this loader to upsert them straight into the local backend's SQLite via
db.upsert_job — same direct-write pattern as scripts/rfj_to_local_sqlite.py.

Once a row lands here, everything downstream is unchanged: tailored resume +
cover-letter generation, the apply agent (ats_type="indeed" -> honest manual
fallback that opens apply_url), dedup, and pipeline tracking.

Attribution / ToS: personal use only. Keep the Indeed apply URL intact, store
JD text only in the private DB, do not republish Indeed listings.

Usage
-----
  REVERSE_ATS_DB_PATH=/path/to/local.db \
    python3 scripts/indeed_to_local_sqlite.py path/to/indeed_jobs.json

Input JSON: a list of objects. Required: company, title, apply_url,
description_full. Optional: location, salary_min, salary_max, employment_type,
category, remote, id (a stable id is recommended so re-runs dedup cleanly).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))

import db  # backend/db.py  # noqa: E402


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:60]


# Fully-remote gate. Indeed's location="remote" search still returns hybrid /
# onsite-with-remote-flexibility roles, so we drop anything that signals an
# office requirement. Conservative by design: better to miss a borderline role
# than surface an onsite one (user preference: fully remote only).
#
# Work-mode PHRASES only — never a bare "hybrid"/"onsite" token, which yields
# false positives on methodology language like "hybrid delivery models" or
# "on-site support team". Location is checked separately (a "Hybrid - Austin"
# style location IS disqualifying).
_ONSITE_PHRASES = (
    "on-site", "onsite", "on site ", "in-office", "in office", "in the office",
    "days a week in", "days per week in", "days/week in", "days in office",
    "days in the office", "must relocate", "relocation required",
    "required to relocate", "hybrid role", "hybrid position", "hybrid work",
    "hybrid schedule", "hybrid model", "hybrid remote", "remote/hybrid",
    "hybrid setup", "hybrid arrangement", "hybrid (",
)


def _is_fully_remote(m: dict) -> bool:
    if not m.get("remote", True):
        return False
    loc = (m.get("location") or "").lower()
    if "hybrid" in loc or "on-site" in loc or "onsite" in loc:
        return False
    blob = f"{loc} {m.get('workplace_type','')} {m.get('description_full','')}".lower()
    return not any(kw in blob for kw in _ONSITE_PHRASES)


def _map(job: dict) -> dict | None:
    company = (job.get("company") or "").strip()
    title = (job.get("title") or "").strip()
    apply_url = (job.get("apply_url") or job.get("url") or "").strip()
    if not company or not title or not apply_url:
        return None
    smin = job.get("salary_min") or None
    smax = job.get("salary_max") or None
    job_id = job.get("id") or f"indeed-{_slug(company)}-{_slug(title)}"
    return {
        "id": job_id,
        "company": company,
        "title": title,
        "location": job.get("location") or "Remote",
        "url": apply_url,
        "apply_url": apply_url,
        "description_full": job.get("description_full") or "",
        "description_snippet": (job.get("description_full") or "")[:400],
        "category": job.get("category") or "program-management",
        "ats_type": "indeed",
        "ats": None,  # not Greenhouse/Lever/Ashby -> apply agent uses manual fallback
        "remote": 1 if job.get("remote", True) else 0,
        "employment_type": job.get("employment_type") or "Full-time",
        "workplace_type": "Remote" if job.get("remote", True) else None,
        "salary_min": int(smin) if smin else None,
        "salary_max": int(smax) if smax else None,
        "salary_currency": "USD" if (smin or smax) else None,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: indeed_to_local_sqlite.py <indeed_jobs.json>")
        return 2
    remote_only = "--all-locations" not in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    raw = json.loads(Path(args[0]).read_text())
    mapped = [m for j in raw if (m := _map(j))]
    if remote_only:
        kept, dropped = [], []
        for m in mapped:
            (kept if _is_fully_remote(m) else dropped).append(m)
        for m in dropped:
            print(f"SKIP (not fully remote)  ::  {m['company']} — {m['title']} [{m.get('location')}]")
        jobs = kept
    else:
        jobs = mapped
    if not jobs:
        print("no valid fully-remote jobs in input")
        return 1

    db.init_db()
    conn = db.get_connection()
    new = upd = 0
    for m in jobs:
        try:
            jid, is_new = db.upsert_job(conn, m)
            new += 1 if is_new else 0
            upd += 0 if is_new else 1
            print(f"{'NEW ' if is_new else 'UPD '}{jid}  ::  {m['company']} — {m['title']}")
        except Exception as e:
            print(f"upsert {m.get('id','?')[:24]} failed: {e}")
    conn.commit()
    conn.close()
    print(f"loaded {len(jobs)} Indeed jobs into local SQLite: new={new} updated={upd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
