#!/usr/bin/env python3
"""
Audit the CI-lane company registry — hit each Greenhouse/Lever/Ashby/custom
endpoint and report raw vs filtered job counts per company.

Diagnoses why the hosted CI lane produces few net-new D1 inserts:
  - 0 raw jobs ⇒ ATS endpoint is dead / slug renamed / company removed board
  - high raw, low filtered ⇒ title filter throttling
  - errors ⇒ schema change, rate limit, 4xx/5xx

Read-only. Does NOT touch /ingest. Safe to run anytime.

Workday tenants are skipped (they run from GX10 on a separate cron).

Usage:
    .venv/bin/python scripts/audit_ci_companies.py
    .venv/bin/python scripts/audit_ci_companies.py --limit 10
    .venv/bin/python scripts/audit_ci_companies.py --ats greenhouse
    .venv/bin/python scripts/audit_ci_companies.py --json > audit.json
"""

import argparse
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scraper"))

from job_scraper import (  # noqa: E402
    COMPANIES,
    fetch_greenhouse,
    fetch_lever,
    fetch_ashby,
    fetch_custom,
    _passes_title_filter,
)

SKIP_ATS = {"workday"}  # GX10 cron handles these; not part of CI lane

RATE_SLEEP = 0.3  # be polite to ATS endpoints


def audit_company(company: dict) -> dict:
    name = company["name"]
    ats = company["ats"]
    slug = company.get("slug", "")
    started = time.time()

    raw = []
    error = None
    try:
        if ats == "greenhouse":
            raw = fetch_greenhouse(slug, name)
        elif ats == "lever":
            raw = fetch_lever(slug, name)
        elif ats == "ashby":
            raw = fetch_ashby(slug, name)
        elif ats == "custom":
            raw = fetch_custom(company, name)
        else:
            error = f"unknown ATS: {ats}"
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"

    filtered = [j for j in raw if _passes_title_filter(j.get("title", ""))] if raw else []

    return {
        "company": name,
        "ats": ats,
        "slug": slug,
        "raw": len(raw),
        "filtered": len(filtered),
        "dropoff_pct": round((1 - len(filtered) / len(raw)) * 100, 1) if raw else None,
        "elapsed_s": round(time.time() - started, 2),
        "error": error,
    }


def classify(r: dict) -> str:
    if r["error"]:
        return "ERROR"
    if r["raw"] == 0:
        return "EMPTY"
    if r["filtered"] == 0:
        return "ALL_FILTERED"
    if r["dropoff_pct"] is not None and r["dropoff_pct"] >= 95:
        return "HIGH_FILTER"
    return "OK"


STATUS_ICON = {
    "OK": "✅",
    "EMPTY": "❌",
    "ALL_FILTERED": "🪤",
    "HIGH_FILTER": "⚠️ ",
    "ERROR": "💥",
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=None, help="audit only the first N companies (for spot-checks)")
    ap.add_argument("--ats", choices=["greenhouse", "lever", "ashby", "custom"], help="audit only one ATS type")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of human-readable table")
    args = ap.parse_args()

    targets = [c for c in COMPANIES if c.get("ats") not in SKIP_ATS]
    if args.ats:
        targets = [c for c in targets if c.get("ats") == args.ats]
    if args.limit:
        targets = targets[: args.limit]

    if not args.json:
        print(f"Auditing {len(targets)} companies (skipping {sum(1 for c in COMPANIES if c.get('ats') in SKIP_ATS)} Workday)...")
        print()

    results = []
    for i, c in enumerate(targets, 1):
        r = audit_company(c)
        r["status"] = classify(r)
        results.append(r)
        if not args.json:
            err_suffix = f"  ← {r['error']}" if r["error"] else ""
            print(
                f"[{i:>3}/{len(targets)}] {STATUS_ICON[r['status']]} "
                f"{r['company']:<28} {r['ats']:<10} "
                f"raw={r['raw']:>4}  filt={r['filtered']:>4}  "
                f"({r['elapsed_s']:>4.1f}s){err_suffix}"
            )
        time.sleep(RATE_SLEEP)

    if args.json:
        print(json.dumps({"results": results}, indent=2))
        return 0

    # ─── Summary ────────────────────────────────────────────────
    by_status = {}
    for r in results:
        by_status.setdefault(r["status"], []).append(r)

    total_raw = sum(r["raw"] for r in results)
    total_filt = sum(r["filtered"] for r in results)
    print()
    print("=" * 72)
    print("  Audit Summary")
    print("=" * 72)
    print(f"  Companies tested:    {len(results)}")
    print(f"  Raw jobs returned:   {total_raw:,}")
    print(f"  After title filter:  {total_filt:,}  ({round(total_filt/total_raw*100,1) if total_raw else 0}%)")
    print()
    for status in ("OK", "HIGH_FILTER", "ALL_FILTERED", "EMPTY", "ERROR"):
        rs = by_status.get(status, [])
        if not rs:
            continue
        print(f"  {STATUS_ICON[status]} {status:<14} ({len(rs):>3})")

    # Detail blocks for the problem categories — these are the actionable lists.
    for status in ("EMPTY", "ERROR", "ALL_FILTERED", "HIGH_FILTER"):
        rs = by_status.get(status, [])
        if not rs:
            continue
        print()
        print(f"  ── {STATUS_ICON[status]} {status} ──")
        for r in sorted(rs, key=lambda x: (x["ats"], x["company"])):
            extra = f"  raw={r['raw']} filt={r['filtered']}"
            if r["error"]:
                extra += f"  err={r['error']}"
            print(f"    {r['company']:<28} {r['ats']:<10} slug={r['slug']:<20}{extra}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
