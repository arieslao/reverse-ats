#!/usr/bin/env python3
"""Load Y Combinator "Work at a Startup" job listings into the LOCAL SQLite DB.

Fourth local source next to RFJ (scripts/rfj_to_local_sqlite.py), Indeed
(scripts/indeed_to_local_sqlite.py) and IA40 (scripts/ia40_to_local_sqlite.py).

https://www.ycombinator.com/jobs/role/<role> is a server-rendered Inertia page:
the `<div data-page="...">` attribute carries a JSON payload whose
`jobPostings` list has title, location, salary/equity range, min experience,
company, batch and a relative "createdAt". Each job page
(/companies/<slug>/jobs/<id>-<title>) carries the markdown `description`.
Reading needs no login; APPLYING needs a YC account, so rows land with
`ats=None` and the apply agent opens the job page (same manual fallback as
Indeed rows). `ats_resolver.py` may still map the company to a public
Greenhouse/Ashby/Lever board later, which makes the row autofillable.

Per run: every configured role page is re-read (they are small, ~30-40 rows
each); job descriptions are fetched only for postings NOT already in the DB.
Existing rows are re-sent WITH their stored description, because
db.upsert_job COALESCEs description_full and an empty string would blank it.

Filters, in order: title lane regex (YC_TITLE_REGEX, '' disables) -> US or
unspecified country -> the shared location gate (fully remote, or hybrid /
on-site inside config/local_metro.json; --all-locations bypasses).

Usage
-----
  REVERSE_ATS_DB_PATH=/path/to/local.db python3 scripts/yc_to_local_sqlite.py
  python3 scripts/yc_to_local_sqlite.py --dry-run        # fetch+filter, no DB writes
  python3 scripts/yc_to_local_sqlite.py --all-locations  # skip the location gate

Env: YC_ROLES (comma list of role slugs), YC_TITLE_REGEX, YC_TITLE_EXCLUDE,
YC_MAX_DETAIL (cap on new detail fetches per run, default 150), YC_SLEEP
(seconds between fetches).
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "scripts"))

import db  # backend/db.py  # noqa: E402
from ats_resolver import ensure_columns  # noqa: E402
from indeed_to_local_sqlite import passes_location_gate, LOCATION_POLICY  # noqa: E402
from job_lanes import DEFAULT_TITLE_REGEX, DEFAULT_TITLE_EXCLUDE, compile_title_filter  # noqa: E402

BASE = "https://www.ycombinator.com"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")

# Role pages that carry the candidate's lanes. software-engineer is included
# because YC files "Forward Deployed Engineer", "Solutions Engineer" and
# "Technical Program Manager" under it; the title regex keeps pure SWE out.
DEFAULT_ROLES = "product-manager,operations,sales-manager,support,software-engineer,recruiting-hr"

# Default title lane lives in job_lanes.py (shared with la_companies_to_local_sqlite.py);
# override just this loader's lane via YC_TITLE_REGEX / YC_TITLE_EXCLUDE.
ROLES = [r.strip() for r in os.environ.get("YC_ROLES", DEFAULT_ROLES).split(",") if r.strip()]
TITLE_RE, EXCL_RE = compile_title_filter(
    os.environ.get("YC_TITLE_REGEX", DEFAULT_TITLE_REGEX),
    os.environ.get("YC_TITLE_EXCLUDE", DEFAULT_TITLE_EXCLUDE),
)
MAX_DETAIL = int(os.environ.get("YC_MAX_DETAIL", "150"))
SLEEP = float(os.environ.get("YC_SLEEP", "0.6"))

_DATA_PAGE_RE = re.compile(r'data-page="([^"]+)"')
_SALARY_RE = re.compile(r"\$(\d+(?:\.\d+)?)K\s*-\s*\$(\d+(?:\.\d+)?)K")


class FetchError(Exception):
    pass


def _get(url: str) -> str:
    req = Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    try:
        with urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", "replace")
    except (HTTPError, URLError) as e:
        raise FetchError(f"{url}: {e}") from e


def _inertia_props(page_html: str) -> dict:
    m = _DATA_PAGE_RE.search(page_html)
    if not m:
        raise FetchError("no data-page payload (page layout changed?)")
    return json.loads(html.unescape(m.group(1))).get("props", {})


def fetch_role(role: str) -> list[dict]:
    props = _inertia_props(_get(f"{BASE}/jobs/role/{role}"))
    return props.get("jobPostings") or []


def fetch_description(job_url: str) -> str:
    props = _inertia_props(_get(f"{BASE}{job_url}"))
    job = props.get("job") or {}
    parts = []
    if job.get("interview_process"):
        parts.append(f"Interview process: {job['interview_process']}")
    desc = (job.get("description") or "").strip()
    return "\n\n".join([desc] + parts) if desc else "\n\n".join(parts)


_US = {"US", "USA", "UNITED STATES"}
_REMOTE_CC_RE = re.compile(r"remote\s*\(([^)]*)\)", re.IGNORECASE)
_BARE_CC_RE = re.compile(r"^[A-Z]{2}$")


def _country_ok(location: str) -> bool:
    """YC locations read 'City, Region, CC', bare 'CC', 'Remote (CC; CC)', or
    several of those joined by ' / '. Keep US and unspecified; drop explicit
    non-US. A 2-letter last token counts as a country only with 3+ parts or
    when bare, because 'San Francisco, CA' means California, not Canada."""
    loc = location or ""
    for m in _REMOTE_CC_RE.finditer(loc):
        codes = {c.strip().split(",")[-1].strip().upper() for c in m.group(1).split(";") if c.strip()}
        if codes and not (codes & _US):
            return False
    for part in loc.split(" / "):
        part = part.strip()
        if _REMOTE_CC_RE.search(part):
            continue
        if _BARE_CC_RE.match(part):
            if part.upper() not in _US:
                return False
            continue
        bits = [b.strip() for b in part.split(",")]
        if len(bits) >= 3 and bits[-1].upper() not in _US:
            return False
    return True


def _salary(rng: str | None) -> tuple[int | None, int | None, str | None]:
    m = _SALARY_RE.search(rng or "")
    if not m:
        return None, None, None
    return int(float(m.group(1)) * 1000), int(float(m.group(2)) * 1000), "USD"


def _map(p: dict) -> dict | None:
    company = (p.get("companyName") or "").strip()
    title = (p.get("title") or "").strip()
    url = (p.get("url") or "").strip()
    if not company or not title or not url or not p.get("id"):
        return None
    location = (p.get("location") or "").strip()
    is_remote = "remote" in location.lower()
    smin, smax, cur = _salary(p.get("salaryRange"))
    header = " | ".join(x for x in (
        f"YC {p.get('companyBatchName')}" if p.get("companyBatchName") else "",
        p.get("companyOneLiner") or "",
        f"Salary {p['salaryRange']}" if p.get("salaryRange") else "",
        f"Equity {p['equityRange']}" if p.get("equityRange") else "",
        f"Experience {p['minExperience']}" if p.get("minExperience") else "",
        p.get("visa") or "",
        f"Posted {p['createdAt']} ago" if p.get("createdAt") else "",
    ) if x)
    return {
        "id": f"yc-{p['id']}",
        "company": company,
        "title": title,
        "location": location or ("Remote" if is_remote else ""),
        "url": f"{BASE}{url}",
        "apply_url": f"{BASE}{url}",  # YC apply needs a login; open the job page
        "department": p.get("prettyRole") or None,
        "description_full": None,  # filled from detail page or existing row
        "_header": header,
        "category": "startup-yc",
        "ats_type": "yc",
        "ats": None,
        "remote": 1 if is_remote else 0,
        "employment_type": p.get("type") or "Full-time",
        "workplace_type": "Remote" if is_remote else None,
        "salary_min": smin,
        "salary_max": smax,
        "salary_currency": cur,
        "comp_summary": " · ".join(x for x in (p.get("salaryRange"), p.get("equityRange")) if x) or None,
    }


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    gated = "--all-locations" not in sys.argv

    # 1) Listing pages -> candidate postings (dedup across role pages).
    seen: dict[str, dict] = {}
    errors = 0
    for role in ROLES:
        try:
            postings = fetch_role(role)
        except FetchError as e:
            print(f"FETCH FAIL role={role}: {e}")
            errors += 1
            continue
        kept = 0
        for p in postings:
            m = _map(p)
            if not m or m["id"] in seen:
                continue
            if TITLE_RE and not TITLE_RE.search(m["title"]):
                continue
            if EXCL_RE and EXCL_RE.search(m["title"]):
                continue
            if not _country_ok(m["location"]):
                continue
            seen[m["id"]] = m
            kept += 1
        print(f"{role:18s}: {len(postings)} postings, {kept} new candidates after title/country filter")
        time.sleep(SLEEP)
    if errors == len(ROLES):
        print("every role page failed; aborting")
        return 2

    # 2) Descriptions: existing rows reuse the stored text; new rows fetch it.
    db.init_db()
    conn = db.get_connection()
    ensure_columns(conn)
    existing_desc = {
        jid: desc for jid, desc in conn.execute(
            "SELECT id, description_full FROM jobs WHERE ats_type = 'yc'")
    }
    fetched = 0
    for m in seen.values():
        if m["id"] in existing_desc:
            m["description_full"] = existing_desc[m["id"]] or m["_header"]
            continue
        if fetched >= MAX_DETAIL:
            m["description_full"] = m["_header"]  # scored on header only this run
            continue
        try:
            body = fetch_description(m["url"].replace(BASE, ""))
        except FetchError as e:
            print(f"  detail fail {m['company']} — {m['title']}: {e}")
            body = ""
        fetched += 1
        m["description_full"] = "\n\n".join(x for x in (m["_header"], body) if x)
        time.sleep(SLEEP)
    for m in seen.values():
        m["description_snippet"] = (m["description_full"] or "")[:400]
        m.pop("_header", None)

    # 3) Location gate (needs the description for remote rows' phrase check).
    jobs, dropped = [], []
    for m in seen.values():
        (jobs if (not gated or passes_location_gate(m)) else dropped).append(m)
    for m in dropped:
        print(f"SKIP (not remote / not in home metro)  ::  {m['company']} — {m['title']} [{m['location']}]")
    print(f"\n{len(seen)} candidates, {fetched} descriptions fetched, "
          f"{len(jobs)} pass the location gate (policy={LOCATION_POLICY}), {len(dropped)} dropped")
    if dry_run:
        for m in jobs:
            print(f"  KEEP {m['id']:<10} {m['company']:<28} {m['title'][:48]:<48} [{m['location']}]")
        print("[DRY-RUN] no DB writes")
        conn.close()
        return 0
    if not jobs:
        print("no jobs to load")
        conn.close()
        return 1

    # 4) Upsert with cross-source dedup on normalized company|title.
    existing_keys = {
        (c.lower().strip(), t.lower().strip()): jid
        for jid, c, t in conn.execute("SELECT id, company, title FROM jobs")
    }
    new = upd = xdup = 0
    for m in jobs:
        key = (m["company"].lower().strip(), m["title"].lower().strip())
        prior = existing_keys.get(key)
        if prior and prior != m["id"]:
            xdup += 1
            continue
        try:
            jid, is_new = db.upsert_job(conn, m)
            conn.execute("UPDATE jobs SET apply_url = COALESCE(apply_url, :url) WHERE id = :id",
                         {"id": jid, "url": m["apply_url"]})
            existing_keys[key] = jid
            new += 1 if is_new else 0
            upd += 0 if is_new else 1
        except Exception as e:  # noqa: BLE001
            print(f"upsert {m['id']} failed: {e}")
    conn.commit()
    conn.close()
    print(f"loaded {len(jobs)} YC jobs into local SQLite: new={new} updated={upd} "
          f"cross-source-dups-skipped={xdup}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
