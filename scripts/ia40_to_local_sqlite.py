#!/usr/bin/env python3
"""Load jobs from IA40 companies' ATS boards into the LOCAL SQLite DB.

Third local source next to RFJ (scripts/rfj_to_local_sqlite.py) and Indeed
(scripts/indeed_to_local_sqlite.py). The IA40 (ia40.com) list is ~48 top AI
startups; scripts/ia40_companies.yaml pins each one to its resolved public
ATS board (Ashby / Greenhouse — probed 2026-09-03). We fetch each board
directly with the battle-tested fetchers from scraper/job_scraper.py and
upsert via db.upsert_job — same direct-write pattern as the other loaders.

Differences from the RFJ lane:
  * Jobs arrive PRE-RESOLVED: we know the board and the direct apply URL, so
    this loader stamps apply_url/ats/ats_slug/ats_resolved_at itself and
    ats_resolver.py never needs to probe these rows (its sweep only selects
    `ats IS NULL`).
  * ats_type="ia40" (source identity); the `ats` COLUMN carries the real
    board type so the apply agent can autofill.
  * Remote gate: boards mix onsite/hybrid SF roles, so we drop anything that
    is not fully remote (Ashby workplaceType + the tuned phrase gate shared
    with the Indeed loader).
  * Cross-source dedup: job_id_hash includes the URL, so the same role seen
    via RFJ earlier would insert a second row here. We skip inserts whose
    normalized company|title already exists under a different job id.

Usage
-----
  REVERSE_ATS_DB_PATH=/path/to/local.db python3 scripts/ia40_to_local_sqlite.py
  python3 scripts/ia40_to_local_sqlite.py --dry-run       # fetch+filter, no DB writes
  python3 scripts/ia40_to_local_sqlite.py --all-locations # skip the remote gate
"""

from __future__ import annotations

import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "scripts"))
sys.path.insert(0, str(REPO / "scraper"))

import db  # backend/db.py  # noqa: E402
from ats_resolver import ensure_columns  # noqa: E402
from indeed_to_local_sqlite import _is_fully_remote  # noqa: E402
from job_scraper import FetchError, fetch_ashby, fetch_greenhouse  # noqa: E402

REGISTRY = Path(__file__).resolve().parent / "ia40_companies.yaml"

FETCHERS = {
    "greenhouse": fetch_greenhouse,
    "ashby": fetch_ashby,
}


def _category(sector: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (sector or "ai").lower()).strip("-") or "ai"


def _map(raw: dict, entry: dict) -> dict | None:
    company = (raw.get("company") or entry["name"]).strip()
    title = (raw.get("title") or "").strip()
    url = (raw.get("url") or "").strip()
    if not company or not title or not url:
        return None
    m = dict(raw)
    m["id"] = db.job_id_hash(company, title, url)
    m["company"] = company
    m["ats_type"] = "ia40"
    m["category"] = _category(entry.get("sector"))
    return m


def _passes_remote_gate(m: dict) -> bool:
    # Ashby's workplaceType (OnSite/Hybrid/Remote) is authoritative when set;
    # the shared phrase gate catches "hybrid role"-style JDs on boards that
    # only give a location string (Greenhouse).
    wt = m.get("workplace_type")
    if wt is not None:
        if wt != "Remote":
            return False
    elif "remote" not in (m.get("location") or "").lower():
        # Greenhouse rows carry no workplaceType, and the fetcher's `remote`
        # flag counts any US location as remote-eligible (REMOTE_KEYWORDS has
        # "united states" — cloud-lane semantics). Require an explicit remote
        # location instead.
        return False
    return _is_fully_remote(m)


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    remote_only = "--all-locations" not in sys.argv

    reg = yaml.safe_load(REGISTRY.read_text())
    companies = reg.get("companies", [])
    if not companies:
        print(f"no companies in {REGISTRY}")
        return 2

    now = datetime.now(timezone.utc).isoformat()
    total_fetched = total_kept = 0
    jobs: list[tuple[dict, dict]] = []  # (mapped job, registry entry)
    errors = 0
    for entry in companies:
        fetch = FETCHERS.get(entry["ats"])
        if fetch is None:
            print(f"SKIP {entry['name']}: unsupported ats '{entry['ats']}'")
            continue
        try:
            raw_jobs = fetch(entry["slug"], entry["name"])
        except FetchError as e:
            print(f"FETCH FAIL {entry['name']}: {e}")
            errors += 1
            continue
        mapped = [m for r in raw_jobs if (m := _map(r, entry))]
        kept = [m for m in mapped if _passes_remote_gate(m)] if remote_only else mapped
        total_fetched += len(mapped)
        total_kept += len(kept)
        jobs.extend((m, entry) for m in kept)
        print(f"{entry['name']:24s} {entry['ats']}/{entry['slug']}: "
              f"{len(mapped)} jobs, {len(kept)} pass remote gate")
        time.sleep(0.3)

    print(f"\nfetched {total_fetched} jobs from {len(companies)} boards "
          f"({errors} fetch errors); {total_kept} remote")
    if dry_run:
        print("[DRY-RUN] no DB writes")
        return 0
    if not jobs:
        print("no jobs to load")
        return 1

    db.init_db()
    conn = db.get_connection()
    ensure_columns(conn)

    # Cross-source dedup: normalized company|title pairs already in the DB.
    existing = {
        (c.lower().strip(), t.lower().strip()): jid
        for jid, c, t in conn.execute("SELECT id, company, title FROM jobs")
    }

    new = upd = xdup = 0
    for m, entry in jobs:
        key = (m["company"].lower().strip(), m["title"].lower().strip())
        prior = existing.get(key)
        if prior and prior != m["id"]:
            xdup += 1
            continue  # same role already tracked under another source's row
        try:
            jid, is_new = db.upsert_job(conn, m)
            # Stamp resolver columns so ats_resolver's `ats IS NULL` sweep
            # skips these rows and the apply agent can autofill directly.
            conn.execute(
                """UPDATE jobs SET
                       apply_url = COALESCE(apply_url, :url),
                       ats = COALESCE(ats, :ats),
                       ats_slug = COALESCE(ats_slug, :slug),
                       ats_resolved_at = COALESCE(ats_resolved_at, :now)
                   WHERE id = :id""",
                {"id": jid, "url": m["url"], "ats": entry["ats"],
                 "slug": entry["slug"], "now": now},
            )
            existing[key] = jid
            new += 1 if is_new else 0
            upd += 0 if is_new else 1
        except Exception as e:  # noqa: BLE001
            print(f"upsert {m.get('id','?')[:10]} failed: {e}")
    conn.commit()
    conn.close()
    print(f"loaded {len(jobs)} IA40 jobs into local SQLite: "
          f"new={new} updated={upd} cross-source-dups-skipped={xdup}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
