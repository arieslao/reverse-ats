#!/usr/bin/env python3
"""Load jobs from named LA-based companies' ATS boards into the LOCAL SQLite DB.

Fifth local job source, next to RFJ (rfj_to_local_sqlite.py), Indeed
(indeed_to_local_sqlite.py), IA40 (ia40_to_local_sqlite.py) and YC
(yc_to_local_sqlite.py). The company list is owner-supplied (2026-10-18:
"LA Based Company Career Site List.csv" — Big Tech/Media, Defense & Hard
Tech, Frontier Labs/Robotics/Biotech, Enterprise SaaS/Fintech/Consumer,
Gaming Studios, High-Growth Startups), pinned in scripts/la_companies.yaml
to each company's resolved public ATS board (Greenhouse/Lever/Ashby/
SmartRecruiters/Workday — each VERIFIED by a live probe, not guessed; see
that file's header). Companies with no public ATS API sit in the yaml's
`excluded:` section.

Differences from the other local loaders:
  * These are large, GENERAL company-wide boards (SpaceX ~2,700 jobs,
    Anduril ~2,500), not a pre-filtered AI/startup list — so a TITLE LANE
    filter (scripts/job_lanes.py, shared with the YC loader) is applied
    BEFORE any per-job detail fetch or the location gate, or this loader
    would flood the DB with irrelevant engineering/retail/sales postings.
  * Workday listings carry a known bug upstream (scraper/job_scraper.py's
    two-pass fetch): everything returned by the `searchText="remote"` pass
    is flagged `remote=True` even when the job is actually onsite in some
    other city, and Workday's listing API never includes the job
    description. This loader (a) recomputes `remote` for Workday rows from
    the location TEXT alone (ignoring the search-pass flag) before the
    location gate runs, and (b) fetches each surviving Workday job's detail
    page for its real description (bounded by LA_MAX_DETAIL), the same
    bounded-fetch pattern the YC loader uses.
  * Greenhouse/Lever/Ashby/SmartRecruiters already return full descriptions
    at listing time — no extra fetch needed for those.

Rows arrive pre-resolved (ats/ats_slug/apply_url stamped from the registry,
like the IA40 loader), so ats_resolver.py's `ats IS NULL` sweep skips them
and the apply agent can autofill directly, while `ats_type="la_companies"`
keeps the source identity for digest/README reporting.

Usage
-----
  REVERSE_ATS_DB_PATH=/path/to/local.db python3 scripts/la_companies_to_local_sqlite.py
  python3 scripts/la_companies_to_local_sqlite.py --dry-run        # fetch+filter, no writes
  python3 scripts/la_companies_to_local_sqlite.py --all-locations  # skip the location gate

Env: LA_TITLE_REGEX, LA_TITLE_EXCLUDE (default lane: scripts/job_lanes.py),
LA_MAX_DETAIL (Workday detail-fetch cap per run, default 120), LA_SLEEP
(seconds between company fetches).
"""

from __future__ import annotations

import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import yaml

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "scripts"))
sys.path.insert(0, str(REPO / "scraper"))

import db  # backend/db.py  # noqa: E402
from ats_resolver import ensure_columns  # noqa: E402
from indeed_to_local_sqlite import _is_fully_remote, local_metro_allowed, LOCATION_POLICY  # noqa: E402
from job_lanes import DEFAULT_TITLE_REGEX, DEFAULT_TITLE_EXCLUDE, compile_title_filter, title_in_lane  # noqa: E402
from job_scraper import (  # noqa: E402
    FetchError, fetch_ashby, fetch_greenhouse, fetch_lever, fetch_smartrecruiters,
    fetch_workday, _fetch_workday_job_detail, _workday_cxs_url, _is_remote as _location_says_remote,
)

import json  # noqa: E402
import os  # noqa: E402
import urllib.parse  # noqa: E402

REGISTRY = Path(__file__).resolve().parent / "la_companies.yaml"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")


def _parse_amazon_posted_date(value: str | None) -> str | None:
    """amazon.jobs' posted_date is a human string like "June 17, 2026", not
    ISO-8601 like every other source's posted_at — parse it so date-range
    filtering (e.g. "posted in the last 7 days") compares correctly."""
    if not value:
        return None
    try:
        from datetime import datetime as _dt
        return _dt.strptime(value.strip(), "%B %d, %Y").replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        return None


def fetch_amazon_jobs(entry: dict) -> list[dict]:
    """amazon.jobs' own search.json API (confirmed live 2026-10-18), scoped to
    one Amazon sub-brand via `amazon_query` (e.g. "Ring") since the full
    Amazon board is far too large to pull wholesale here. Not a Greenhouse/
    Lever/Ashby/SmartRecruiters/Workday board — Amazon runs its own in-house
    ATS — so this is a small bespoke fetcher rather than a shared one."""
    query = entry.get("amazon_query") or entry["name"]
    out: list[dict] = []
    offset = 0
    for _ in range(10):  # 100/page cap; 1000 jobs is far more than a sub-brand query needs
        params = urllib.parse.urlencode(
            {"base_query": query, "result_limit": 100, "offset": offset}
        ) + "&normalized_country_code[]=USA"
        req = Request(f"https://www.amazon.jobs/en/search.json?{params}",
                       headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urlopen(req, timeout=20) as r:
                data = json.loads(r.read())
        except (HTTPError, URLError) as e:
            raise FetchError(f"amazon_jobs/{query}: {e}") from e
        jobs = data.get("jobs") or []
        if not jobs:
            break
        for j in jobs:
            desc = "\n\n".join(x for x in (
                j.get("description"), j.get("basic_qualifications") and
                f"Basic qualifications:\n{j['basic_qualifications']}",
                j.get("preferred_qualifications") and
                f"Preferred qualifications:\n{j['preferred_qualifications']}",
            ) if x)
            out.append({
                "title": j.get("title", ""),
                "location": j.get("location") or j.get("normalized_location") or "",
                "url": f"https://www.amazon.jobs{j['job_path']}" if j.get("job_path") else "",
                "department": j.get("business_category") or "",
                "remote": _location_says_remote(j.get("location") or ""),
                "description_full": re.sub(r"<[^>]+>", " ", desc),
                "description_snippet": re.sub(r"<[^>]+>", " ", desc)[:500],
                "posted_at": _parse_amazon_posted_date(j.get("posted_date")),
                "company": entry["name"],
            })
        if len(jobs) < 100:
            break
        offset += 100
    return out


def fetch_eightfold(entry: dict) -> list[dict]:
    """Eightfold-hosted career sites (e.g. explore.jobs.<domain>). Confirmed
    live 2026-10-18 for Netflix. The listing endpoint returns empty
    `job_description`; the per-job detail endpoint (same path + `/<id>`)
    returns the full text, so this mirrors the Workday bounded-detail-fetch
    pattern — detail fetches happen later in main(), gated by LA_MAX_DETAIL,
    so this fetcher only returns listings."""
    base = entry["eightfold_base"].rstrip("/")
    domain = entry["eightfold_domain"]
    out: list[dict] = []
    start = 0
    for _ in range(10):
        req = Request(f"{base}/api/apply/v2/jobs?domain={domain}&start={start}&num=100",
                       headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urlopen(req, timeout=20) as r:
                data = json.loads(r.read())
        except (HTTPError, URLError) as e:
            raise FetchError(f"eightfold/{domain}: {e}") from e
        positions = data.get("positions") or []
        if not positions:
            break
        for p in positions:
            # t_create/t_update are Unix epoch seconds (confirmed against
            # Netflix's board 2026-10-18); prefer t_create (first posted)
            # over t_update (last touched) so a re-posted listing doesn't
            # look freshly created.
            ts = p.get("t_create") or p.get("t_update")
            posted_at = (datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
                         if ts else None)
            out.append({
                "title": p.get("name", ""),
                "location": p.get("location", ""),
                "url": f"{base}/careers/job/{p['id']}" if p.get("id") else "",
                "department": p.get("department") or "",
                "remote": _location_says_remote(p.get("location") or ""),
                "description_full": "",  # filled by detail fetch later, bounded
                "description_snippet": "",
                "posted_at": posted_at,
                "company": entry["name"],
                "_eightfold_id": p.get("id"),
                "_eightfold_base": base,
                "_eightfold_domain": domain,
            })
        if len(positions) < 100:
            break
        start += 100
    return out


def _fetch_eightfold_description(m: dict) -> str:
    jid = m.get("_eightfold_id")
    if not jid:
        return ""
    req = Request(f"{m['_eightfold_base']}/api/apply/v2/jobs/{jid}?domain={m['_eightfold_domain']}",
                   headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=20) as r:
            detail = json.loads(r.read())
    except Exception:
        return ""
    return db._clean_description(detail.get("job_description") or "")
TITLE_RE, EXCL_RE = compile_title_filter(
    os.environ.get("LA_TITLE_REGEX", DEFAULT_TITLE_REGEX),
    os.environ.get("LA_TITLE_EXCLUDE", DEFAULT_TITLE_EXCLUDE),
)
MAX_DETAIL = int(os.environ.get("LA_MAX_DETAIL", "120"))
SLEEP = float(os.environ.get("LA_SLEEP", "0.5"))

FETCHERS = {
    "greenhouse": lambda entry: fetch_greenhouse(entry["slug"], entry["name"]),
    "lever": lambda entry: fetch_lever(entry["slug"], entry["name"]),
    "ashby": lambda entry: fetch_ashby(entry["slug"], entry["name"]),
    "smartrecruiters": lambda entry: fetch_smartrecruiters(entry["slug"], entry["name"]),
    "workday": lambda entry: fetch_workday({"workday": entry["workday"]}, entry["name"]),
    "amazon_jobs": lambda entry: fetch_amazon_jobs(entry),
    "eightfold": lambda entry: fetch_eightfold(entry),
}


def _map(raw: dict, entry: dict) -> dict | None:
    company = (raw.get("company") or entry["name"]).strip()
    title = (raw.get("title") or "").strip()
    url = (raw.get("url") or "").strip()
    if not company or not title or not url:
        return None
    m = dict(raw)
    m["id"] = db.job_id_hash(company, title, url)
    m["company"] = company
    m["ats_type"] = "la_companies"
    m["category"] = entry.get("category") or "la_companies"
    return m


def _fix_workday_remote_flag(m: dict) -> None:
    """Workday's listing fetcher force-flags everything found via its
    searchText="remote" pass as remote=True, even when the job is actually
    onsite elsewhere. Recompute purely from the location text so the location
    gate below isn't fooled into admitting an onsite-in-Denver job as if it
    were fully remote."""
    m["remote"] = 1 if _location_says_remote(m.get("location") or "") else 0
    m.setdefault("workplace_type", None)


def _passes_location_gate(m: dict) -> bool:
    return _is_fully_remote(m) or local_metro_allowed(m)


def _fetch_workday_description(entry: dict, m: dict) -> str:
    api_url = _workday_cxs_url({"workday": entry["workday"]})
    if not api_url:
        return ""
    external_path = (m.get("url") or "").split(api_url.split("/wday/cxs/")[0], 1)[-1]
    detail = _fetch_workday_job_detail(api_url, external_path)
    if not detail:
        return ""
    html = ((detail.get("jobPostingInfo") or {}).get("jobDescription")) or ""
    return db._clean_description(html)


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    gated = "--all-locations" not in sys.argv

    reg = yaml.safe_load(REGISTRY.read_text())
    companies = reg.get("companies", [])
    if not companies:
        print(f"no companies in {REGISTRY}")
        return 2

    now = datetime.now(timezone.utc).isoformat()
    candidates: list[tuple[dict, dict]] = []  # (mapped job, registry entry)
    total_raw = total_lane = errors = 0

    for entry in companies:
        fetch = FETCHERS.get(entry["ats"])
        if fetch is None:
            print(f"SKIP {entry['name']}: unsupported ats '{entry['ats']}'")
            continue
        try:
            raw_jobs = fetch(entry)
        except FetchError as e:
            print(f"FETCH FAIL {entry['name']}: {e}")
            errors += 1
            continue
        except Exception as e:  # noqa: BLE001 — one bad company shouldn't kill the run
            print(f"FETCH FAIL {entry['name']} (unexpected): {e}")
            errors += 1
            continue

        mapped = [m for r in raw_jobs if (m := _map(r, entry))]
        total_raw += len(mapped)
        if entry["ats"] == "workday":
            for m in mapped:
                _fix_workday_remote_flag(m)

        lane = [m for m in mapped if title_in_lane(m["title"], TITLE_RE, EXCL_RE)]
        total_lane += len(lane)
        for m in lane:
            candidates.append((m, entry))
        print(f"{entry['name']:24s} {entry['ats']}/{entry.get('slug', entry.get('workday', {}).get('tenant', '')):20s}: "
              f"{len(mapped)} jobs, {len(lane)} in lane")
        time.sleep(SLEEP)

    print(f"\nfetched {total_raw} jobs from {len(companies)} companies "
          f"({errors} fetch errors); {total_lane} in the candidate's lanes")

    # Location gate.
    kept, dropped = [], []
    for m, entry in candidates:
        (kept if (not gated or _passes_location_gate(m)) else dropped).append((m, entry))
    for m, _ in dropped:
        print(f"SKIP (not remote / not in home metro)  ::  {m['company']} — {m['title']} [{m.get('location')}]")
    print(f"{len(kept)} pass the location gate (policy={LOCATION_POLICY}), {len(dropped)} dropped")

    if dry_run:
        for m, _ in kept:
            print(f"  KEEP {m['id'][:14]:<16} {m['company']:<24} {m['title'][:46]:<46} [{m.get('location')}]")
        print("[DRY-RUN] no DB writes")
        return 0
    if not kept:
        print("no jobs to load")
        return 1

    db.init_db()
    conn = db.get_connection()
    ensure_columns(conn)

    # Workday and Eightfold listings arrive with no description; fetch detail
    # for NEW rows only, bounded per run (mirrors the YC loader's MAX_DETAIL
    # pattern). Greenhouse/Lever/Ashby/SmartRecruiters/amazon_jobs already
    # carry the full description from the listing fetch above.
    existing_ids = {jid for (jid,) in conn.execute("SELECT id FROM jobs")}
    detail_fetches = 0
    for m, entry in kept:
        if entry["ats"] not in ("workday", "eightfold") or m["id"] in existing_ids:
            continue
        if detail_fetches >= MAX_DETAIL:
            continue
        desc = (_fetch_workday_description(entry, m) if entry["ats"] == "workday"
                else _fetch_eightfold_description(m))
        if desc:
            m["description_full"] = desc
            m["description_snippet"] = desc[:500]
        detail_fetches += 1
        time.sleep(SLEEP)
    for m, _ in kept:
        for k in ("_eightfold_id", "_eightfold_base", "_eightfold_domain"):
            m.pop(k, None)  # internal-only, never persisted
    if detail_fetches:
        print(f"fetched {detail_fetches} Workday/Eightfold job descriptions")

    # Cross-source dedup on normalized company|title (same role seen via RFJ
    # or IA40 earlier would otherwise insert a second row here).
    existing_keys = {
        (c.lower().strip(), t.lower().strip()): jid
        for jid, c, t in conn.execute("SELECT id, company, title FROM jobs")
    }
    new = upd = xdup = 0
    for m, entry in kept:
        key = (m["company"].lower().strip(), m["title"].lower().strip())
        prior = existing_keys.get(key)
        if prior and prior != m["id"]:
            xdup += 1
            continue
        try:
            jid, is_new = db.upsert_job(conn, m)
            conn.execute(
                """UPDATE jobs SET
                       apply_url = COALESCE(apply_url, :url),
                       ats = COALESCE(ats, :ats),
                       ats_slug = COALESCE(ats_slug, :slug),
                       ats_resolved_at = COALESCE(ats_resolved_at, :now)
                   WHERE id = :id""",
                {"id": jid, "url": m["url"], "ats": entry["ats"],
                 "slug": (entry.get("slug") or entry.get("workday", {}).get("tenant")
                          or entry.get("eightfold_domain") or entry.get("amazon_query") or ""),
                 "now": now},
            )
            existing_keys[key] = jid
            new += 1 if is_new else 0
            upd += 0 if is_new else 1
        except Exception as e:  # noqa: BLE001
            print(f"upsert {m.get('id', '?')[:10]} failed: {e}")
    conn.commit()
    conn.close()
    print(f"loaded {len(kept)} LA-company jobs into local SQLite: "
          f"new={new} updated={upd} cross-source-dups-skipped={xdup}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
