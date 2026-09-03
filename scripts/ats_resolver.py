#!/usr/bin/env python3
"""Resolve reverse-ats jobs -> real ATS apply URL + ATS type.

Why this exists: the local DB stores only the RemoteFirstJobs *listing* URL, and
RFJ detail pages are Cloudflare-gated. But every company's ATS board API
(Greenhouse / Lever / Ashby) is public and unprotected. So we resolve
company -> ATS board -> match the stored job by title -> real apply URL.
Bonus: for Greenhouse this is the same endpoint that hands us the application
question schema the autofiller needs.

Runs on GX10 (needs the local SQLite + outbound to public ATS APIs). No browser.

  REVERSE_ATS_DB_PATH=.../reverse_ats.db python3 ats_resolver.py --company "Alpaca" --dry-run
  ... --pipeline            # only jobs currently in the kanban pipeline
  ... --all --limit 300     # sweep the active pool
"""
from __future__ import annotations
import argparse, json, os, re, sqlite3, time, unicodedata
from datetime import datetime, timezone
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError


def _ascii(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")

DB = os.environ.get(
    "REVERSE_ATS_DB_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "local-instance", "reverse_ats.db"),
)


def slug_candidates(name: str) -> list[str]:
    base = re.sub(r"[.,]", "", _ascii(name).strip().lower())
    no_space = re.sub(r"\s+", "", base)
    hyphen = re.sub(r"\s+", "-", base)
    stripped = re.sub(r"\s+(labs|inc|ai|health|group|technologies|studios)$", "", base)
    out = []
    for c in (no_space, hyphen, re.sub(r"\s+", "", stripped), re.sub(r"\s+", "-", stripped)):
        if c and c not in out:
            out.append(c)
    return out


def _get(url: str, timeout: int = 12):
    try:
        req = urlrequest.Request(url, headers={"User-Agent": "Mozilla/5.0 reverse-ats-resolver"})
        with urlrequest.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except HTTPError as e:
        return e.code, b""
    except (URLError, TimeoutError, OSError, UnicodeError, ValueError):
        return 0, b""


def gh_jobs(slug):
    s, b = _get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs")
    if s != 200:
        return None
    try:
        return [{"title": (j.get("title") or "").strip(), "url": j.get("absolute_url"),
                 "id": str(j.get("id"))} for j in json.loads(b).get("jobs", [])]
    except Exception:
        return None


def lever_jobs(slug):
    s, b = _get(f"https://api.lever.co/v0/postings/{slug}?mode=json")
    if s != 200:
        return None
    try:
        d = json.loads(b)
        if not isinstance(d, list):
            return None
        return [{"title": (j.get("text") or "").strip(),
                 "url": j.get("hostedUrl") or j.get("applyUrl"), "id": j.get("id")} for j in d]
    except Exception:
        return None


def ashby_jobs(slug):
    s, b = _get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}")
    if s != 200:
        return None
    try:
        return [{"title": (j.get("title") or "").strip(),
                 "url": j.get("jobUrl") or j.get("applyUrl"), "id": j.get("id")}
                for j in json.loads(b).get("jobs", [])]
    except Exception:
        return None


PROBES = [("greenhouse", gh_jobs), ("lever", lever_jobs), ("ashby", ashby_jobs)]
_cache: dict = {}


def resolve_board(company):
    if company in _cache:
        return _cache[company]
    res = (None, None, None)
    for slug in slug_candidates(company):
        for ats, fn in PROBES:
            jobs = fn(slug)
            time.sleep(0.15)  # polite
            if jobs:
                res = (ats, slug, jobs)
                _cache[company] = res
                return res
    _cache[company] = res
    return res


def norm(t):
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def match_job(title, jobs):
    nt = norm(title)
    for j in jobs:
        if norm(j["title"]) == nt:
            return j, "exact"
    for j in jobs:
        njt = norm(j["title"])
        if nt and njt and (nt in njt or njt in nt):
            return j, "contains"
    ts = set(nt.split())
    best, bs = None, 0.0
    for j in jobs:
        js = set(norm(j["title"]).split())
        if not js:
            continue
        ov = len(ts & js) / max(1, len(ts | js))
        if ov > bs:
            bs, best = ov, j
    if best and bs >= 0.6:
        return best, f"token{bs:.2f}"
    return None, "none"


def ensure_columns(conn):
    cols = {r[1] for r in conn.execute("PRAGMA table_info(jobs)")}
    for c, t in [("apply_url", "TEXT"), ("ats", "TEXT"), ("ats_slug", "TEXT"),
                 ("ats_job_id", "TEXT"), ("ats_resolved_at", "TEXT")]:
        if c not in cols:
            conn.execute(f"ALTER TABLE jobs ADD COLUMN {c} {t}")
    conn.commit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--company")
    ap.add_argument("--pipeline", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    conn = sqlite3.connect(DB, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=15000")
    # AUTOCOMMIT: each UPDATE commits immediately so we never hold a write lock
    # across the slow per-company ATS-board HTTP probes. A long open transaction
    # here previously locked the DB for the whole run and blocked the backend's
    # startup (init_db) → "database is locked". Autocommit = tiny lock windows.
    conn.isolation_level = None
    if not a.dry_run:
        ensure_columns(conn)

    if a.company:
        rows = conn.execute("SELECT id,company,title,url FROM jobs WHERE company LIKE ? AND COALESCE(expired,0)=0",
                            (f"%{a.company}%",)).fetchall()
    elif a.pipeline:
        rows = conn.execute("SELECT j.id,j.company,j.title,j.url FROM jobs j JOIN pipeline p ON p.job_id=j.id").fetchall()
    else:
        # UNRESOLVED jobs only, newest first — the pool that actually needs
        # resolving (the old bug swept the already-resolved head instead). Skip
        # Indeed (never a GH/Lever/Ashby board) and anything ATTEMPTED in the
        # last 3 days (so no-public-board companies aren't re-probed every run;
        # retried occasionally in case they add a board).
        rows = conn.execute(
            """SELECT id,company,title,url FROM jobs
               WHERE COALESCE(expired,0)=0 AND COALESCE(dismissed,0)=0
                 AND ats IS NULL AND COALESCE(ats_type,'') != 'indeed'
                 AND (ats_resolved_at IS NULL OR ats_resolved_at < datetime('now','-3 days'))
               ORDER BY first_seen_at DESC
               LIMIT ?""",
            (a.limit,)).fetchall()

    print(f"resolving {len(rows)} job(s){' [DRY-RUN]' if a.dry_run else ''}\n")
    stats = {"greenhouse": 0, "lever": 0, "ashby": 0, "unresolved": 0}
    now = datetime.now(timezone.utc).isoformat()
    for r in rows:
        ats, slug, jobs = resolve_board(r["company"])
        if not ats:
            stats["unresolved"] += 1
            print(f"  [-- ] {r['company'][:22]:22} | no public board       | {r['title'][:42]}")
            if not a.dry_run:  # stamp the attempt so we don't re-probe every run
                conn.execute("UPDATE jobs SET ats_resolved_at=? WHERE id=?", (now, r["id"]))
            continue
        j, how = match_job(r["title"], jobs)
        if not j or not j.get("url"):
            stats["unresolved"] += 1
            print(f"  [{ats[:2]} ] {r['company'][:22]:22} | board ok, no match({len(jobs)}) | {r['title'][:42]}")
            if not a.dry_run:
                conn.execute("UPDATE jobs SET ats_resolved_at=? WHERE id=?", (now, r["id"]))
            continue
        stats[ats] += 1
        print(f"  [{ats[:2]} ] {r['company'][:22]:22} | {how:11} | {j['url']}")
        if not a.dry_run:
            conn.execute("UPDATE jobs SET apply_url=?,ats=?,ats_slug=?,ats_job_id=?,ats_resolved_at=? WHERE id=?",
                         (j["url"], ats, slug, str(j["id"]), now, r["id"]))
    if not a.dry_run:
        conn.commit()
    conn.close()
    print("\nstats:", stats)


if __name__ == "__main__":
    main()
