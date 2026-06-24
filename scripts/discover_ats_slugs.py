#!/usr/bin/env python3
"""Resolve company names → confirmed public ATS board slugs.

Seed list: https://remotefirstjobs.com/top-remote-companies

For each company we generate candidate slugs from the name and probe the public,
no-auth job-board APIs of Greenhouse / Lever / Ashby. A candidate is "confirmed"
only if the endpoint returns a non-empty job list. Confirmed boards that are NOT
already in scraper/job_scraper.py:COMPANIES are emitted as paste-ready registry
entries; everything else is reported so nothing is silently dropped.

This is a one-off discovery helper — run locally, eyeball the output, then paste
the confirmed entries into COMPANIES. Both scrape lanes pick them up next tick.

Usage:
  python3 scripts/discover_ats_slugs.py                 # probe the built-in seed list
  python3 scripts/discover_ats_slugs.py "Acme" "Globex"  # probe specific names
  python3 scripts/discover_ats_slugs.py --json           # machine-readable report

Workday tenants are NOT probed here — they need a tenant+host+site triple that
can't be guessed reliably; resolve those by hand from the careers URL (see
reverse-ats-architecture memory).
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scraper"))

try:
    from job_scraper import COMPANIES  # noqa: E402
except Exception:  # pragma: no cover - registry import is best-effort
    COMPANIES = []

# Seed list scraped from remotefirstjobs.com/top-remote-companies (2026-06-24).
SEED_COMPANIES = [
    "Fever", "MongoDB", "Datadog", "NiCE", "OpenAI", "Samsara", "Waymo",
    "Binance", "Remote", "Braze", "Bolt", "Brex", "Xometry", "iCapital",
    "Affirm", "Twilio", "Celonis", "Nagarro", "ClickHouse", "CoreWeave",
    "Instacart", "Prolific", "Cloudflare", "Fundraise Up", "Glean", "Intercom",
    "Lyft", "Reddit", "ServiceNow", "Encora", "Diligent", "Figma", "NeuraFlash",
    "Sezzle", "Airbnb", "Spotify", "BridgeBio", "Wayve", "ElevenLabs", "Vanta",
    "AlphaSense", "Fivetran", "Grafana Labs", "Wiz", "HelloFresh", "Canva",
    "Stripe", "DoiT", "Smartsheet", "Chainguard", "Tide", "FanDuel",
    "Guidepoint", "Lyra Health", "Klaviyo", "Taboola", "Abnormal AI", "CoverGo",
]


def slug_candidates(name: str) -> list[str]:
    """Plausible board slugs from a display name."""
    base = name.strip().lower()
    base = re.sub(r"[.,]", "", base)
    no_space = re.sub(r"\s+", "", base)
    hyphen = re.sub(r"\s+", "-", base)
    # Drop common suffixes like "labs", "inc", "ai", "health" only as extra tries.
    stripped = re.sub(r"\s+(labs|inc|ai|health|group|technologies|studios)$", "", base)
    cands = {no_space, hyphen, re.sub(r"\s+", "", stripped)}
    return [c for c in cands if c]


def _get(url: str, timeout: int = 12) -> tuple[int, bytes]:
    req = urlrequest.Request(url, headers={"User-Agent": "Mozilla/5.0 reverse-ats-discovery"})
    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except HTTPError as e:
        return e.code, b""
    except (URLError, TimeoutError):
        return 0, b""


def probe_greenhouse(slug: str) -> int | None:
    status, body = _get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs")
    if status != 200:
        return None
    try:
        return len(json.loads(body).get("jobs", []))
    except (json.JSONDecodeError, AttributeError):
        return None


def probe_lever(slug: str) -> int | None:
    status, body = _get(f"https://api.lever.co/v0/postings/{slug}?mode=json")
    if status != 200:
        return None
    try:
        data = json.loads(body)
        return len(data) if isinstance(data, list) else None
    except json.JSONDecodeError:
        return None


def probe_ashby(slug: str) -> int | None:
    status, body = _get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}")
    if status != 200:
        return None
    try:
        return len(json.loads(body).get("jobs", []))
    except (json.JSONDecodeError, AttributeError):
        return None


PROBES = [("greenhouse", probe_greenhouse), ("lever", probe_lever), ("ashby", probe_ashby)]


def resolve(name: str, known_slugs: set[str]) -> dict | None:
    for slug in slug_candidates(name):
        for ats, probe in PROBES:
            count = probe(slug)
            time.sleep(0.2)  # be polite to public APIs
            if count and count > 0:
                return {
                    "name": name,
                    "ats": ats,
                    "slug": slug,
                    "count": count,
                    "already_known": (ats, slug) in known_slugs or slug in {s for _, s in known_slugs},
                }
    return None


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    as_json = "--json" in sys.argv
    names = args or SEED_COMPANIES

    known_slugs = {(c.get("ats"), c.get("slug")) for c in COMPANIES}
    known_names = {c.get("name", "").lower() for c in COMPANIES}

    confirmed_new, already, unresolved = [], [], []
    for name in names:
        if name.lower() in known_names:
            already.append({"name": name, "reason": "name already in registry"})
            continue
        hit = resolve(name, known_slugs)
        if hit and not hit["already_known"]:
            confirmed_new.append(hit)
        elif hit:
            already.append({"name": name, "ats": hit["ats"], "slug": hit["slug"]})
        else:
            unresolved.append(name)

    if as_json:
        print(json.dumps(
            {"confirmed_new": confirmed_new, "already": already, "unresolved": unresolved},
            indent=2,
        ))
        return 0

    print(f"\n=== Confirmed NEW boards ({len(confirmed_new)}) — paste into COMPANIES ===")
    for c in confirmed_new:
        cat = "remote_first"
        print(
            f'    {{"name": "{c["name"]}", "ats": "{c["ats"]}", '
            f'"slug": "{c["slug"]}", "category": "{cat}"}},'
            f'   # {c["count"]} jobs'
        )
    print(f"\n=== Already covered ({len(already)}) ===")
    for c in already:
        print(f'  - {c["name"]} ({c.get("ats","?")}/{c.get("slug","?")})')
    print(f"\n=== Unresolved — no public GH/Lever/Ashby board ({len(unresolved)}) ===")
    print("  (likely Workday/custom/private ATS — resolve by hand or skip)")
    for n in unresolved:
        print(f"  - {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
