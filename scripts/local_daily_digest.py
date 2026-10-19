#!/usr/bin/env python3
"""Daily digest for the PRIVATE (local SQLite) Reverse-ATS instance.

Runs on GX10 cron. Unlike daily_digest_gx10.py (which pulls from the cloud Worker),
this uses the LOCAL engine end to end:
  1. Pull Remote First Jobs into the local SQLite DB.
  2. Score unscored jobs with the local years-weighted scorer (pipeline --score-only).
  3. For every NEW match at or above the score threshold (default 90), generate the
     master-template tailored résumé + grounded cover letter and email them as .docx
     attachments — one digest email, all attachments — via the Worker /digest/send relay.
  4. Record emailed jobs so each is sent only once.

Env (loaded from .digest.env by the cron):
  CF_BASE_URL, CF_INGEST_SECRET   — the send relay
  CANDIDATE_NAME / CANDIDATE_CONTACT or EMAIL_TO — recipient + résumé header
  DIGEST_MIN_SCORE (default 90), DIGEST_MAX_JOBS (default 25)
  DIGEST_TAILOR (default 1) — set 0 to skip résumé/cover-letter generation and
    email the ranked match list only (no LLM calls beyond scoring).

Owner call 2026-10-19: the aggregators (Remote First Jobs, Indeed) stay at the
plain DIGEST_MIN_SCORE bar, unchanged — a real test of a genuinely excellent
fit. But the direct-company sources (your LA company list, Y Combinator, IA40
AI startups) were topping out around 75% most days and so would silently
never email under that same bar. For those three, every run also pulls the
single best not-yet-emailed match from EACH source regardless of score and
sends it in a clearly separate, honestly labeled section — never presented as
a 90%+ match. DIRECT_COMPANY_GUARANTEED_PICKS=0 disables this and reverts to
the plain ≥DIGEST_MIN_SCORE behavior for every source.
"""

import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BACKEND = os.path.join(ROOT, "backend")
sys.path.insert(0, BACKEND)

DB_PATH = os.environ.setdefault(
    "REVERSE_ATS_DB_PATH", os.path.join(ROOT, "local-instance", "reverse_ats.db")
)
MIN_SCORE = int(os.environ.get("DIGEST_MIN_SCORE", "90"))
MAX_JOBS = int(os.environ.get("DIGEST_MAX_JOBS", "25"))
PACE_SECONDS = float(os.environ.get("DIGEST_PACE", "2"))
TAILOR = os.environ.get("DIGEST_TAILOR", "1").strip().lower() not in ("0", "false", "no", "off")
GUARANTEED_PICKS = os.environ.get("DIRECT_COMPANY_GUARANTEED_PICKS", "1").strip().lower() not in ("0", "false", "no", "off")

# Sources pulled directly from each employer's own ATS, as opposed to
# Remote First Jobs / Indeed, which aggregate across many employers.
DIRECT_COMPANY_SOURCES = ("la_companies", "yc", "ia40")
DIRECT_COMPANY_LABELS = {
    "la_companies": "your LA company list",
    "yc": "Y Combinator",
    "ia40": "the IA40 AI startup list",
}

import db  # noqa: E402
from scorer import tailor_master_resume, generate_cover_letter  # noqa: E402
import resume_tailor as rt  # noqa: E402
from docgen import slug, master_resume_to_docx, cover_to_docx  # noqa: E402


def log(msg: str) -> None:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def _recipient(profile_contact: str) -> str:
    blob = f"{os.environ.get('EMAIL_TO','')} {os.environ.get('CANDIDATE_CONTACT','')} {profile_contact}"
    m = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", blob)
    return (m.group(0) if m else "aries.lao@gmail.com").strip()


def _run(cmd: list, label: str) -> None:
    env = {**os.environ, "REVERSE_ATS_DB_PATH": DB_PATH}
    log(f"{label}: {' '.join(cmd)}")
    try:
        r = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True, timeout=1800)
    except subprocess.TimeoutExpired:
        log(f"{label} timed out after 1800s — continuing; scoring commits per-job and resumes next run")
        return
    if r.returncode != 0:
        log(f"{label} exited {r.returncode}: {r.stderr[-300:]}")
    else:
        log(f"{label} ok")


def _ensure_log_table(conn) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS digest_log (job_id TEXT PRIMARY KEY, sent_at TEXT)")
    conn.commit()


def _new_matches(conn):
    rows = conn.execute(
        """
        SELECT j.* FROM jobs j
        WHERE j.expired = 0
          AND j.llm_score >= ?
          AND j.id NOT IN (SELECT job_id FROM digest_log)
        ORDER BY j.llm_score DESC, j.first_seen_at DESC
        """,
        (MIN_SCORE,),
    ).fetchall()
    return [dict(r) for r in rows]


def _guaranteed_picks(conn, exclude_ids: set) -> list[dict]:
    """One top pick per direct-company source per run, regardless of score.

    Excludes anything already in `exclude_ids` (so a source whose best match
    already cleared MIN_SCORE isn't double-counted) and anything scored by
    the keyword fallback rather than the real LLM (an unreliable number —
    see memory reverse-ats-indeed-lane: "LLM unavailable" rows), so a
    transient scorer outage can't produce a misleadingly-labeled pick. Each
    returned dict carries `_guaranteed_pick_source` so the email renderer
    labels it honestly instead of implying a MIN_SCORE-grade match."""
    picks = []
    for source in DIRECT_COMPANY_SOURCES:
        row = conn.execute(
            """
            SELECT j.* FROM jobs j
            WHERE j.ats_type = ?
              AND j.expired = 0 AND j.dismissed = 0
              AND j.llm_score IS NOT NULL
              AND (j.llm_reasoning IS NULL OR j.llm_reasoning NOT LIKE '%LLM unavailable%')
              AND j.id NOT IN (SELECT job_id FROM digest_log)
            ORDER BY j.llm_score DESC, j.first_seen_at DESC
            LIMIT 1
            """,
            (source,),
        ).fetchone()
        if row and row["id"] not in exclude_ids:
            d = dict(row)
            d["_guaranteed_pick_source"] = source
            picks.append(d)
    return picks


def _send(base: str, secret: str, to: str, subject: str, html: str, attachments: list) -> bool:
    payload = json.dumps({"to": to, "subject": subject, "html": html, "attachments": attachments}).encode()
    req = urllib.request.Request(f"{base}/digest/send", data=payload, method="POST")
    req.add_header("Authorization", f"Bearer {secret}")
    req.add_header("User-Agent", "Mozilla/5.0 (reverse-ats-gx10)")
    req.add_header("Content-Type", "application/json")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                if json.loads(r.read().decode()).get("ok"):
                    return True
        except urllib.error.HTTPError as e:
            log(f"relay {e.code}: {e.read().decode()[:200]}")
        except Exception as e:  # noqa: BLE001
            log(f"relay error: {e}")
        time.sleep(3 * (attempt + 1))
    return False


def main() -> int:
    base = os.environ.get("CF_BASE_URL", "").rstrip("/")
    secret = os.environ.get("CF_INGEST_SECRET", "")
    if not base or not secret:
        log("CF_BASE_URL / CF_INGEST_SECRET missing — cannot send. Exiting.")
        return 2

    # 1. Pull RFJ + IA40 + YC + named-LA-company boards into local SQLite, then
    # 2. score unscored jobs.
    _run([sys.executable, os.path.join(HERE, "rfj_to_local_sqlite.py")], "pull-rfj")
    _run([sys.executable, os.path.join(HERE, "ia40_to_local_sqlite.py")], "pull-ia40")
    _run([sys.executable, os.path.join(HERE, "yc_to_local_sqlite.py")], "pull-yc")
    _run([sys.executable, os.path.join(HERE, "la_companies_to_local_sqlite.py")], "pull-la-companies")
    _run([sys.executable, os.path.join(BACKEND, "pipeline.py"), "--score-only"], "score")

    conn = db.get_connection()
    _ensure_log_table(conn)

    profile = {}
    try:
        from db import get_profile
        profile = get_profile(conn) or {}
    except Exception:  # noqa: BLE001
        pass
    master = (profile.get("resume_text") or "").strip()
    if TAILOR and not (master and rt.looks_like_master(master)):
        log("No master résumé on file — cannot tailor. Upload it in Admin → Profile.")
        return 3
    if not TAILOR:
        log("DIGEST_TAILOR=0 — sending ranked matches only, no résumé/cover-letter generation")

    try:
        from db import get_llm_settings
        settings = get_llm_settings(conn)
    except Exception:  # noqa: BLE001
        settings = None

    to = _recipient(rt.split_master(master)[1] if master and rt.looks_like_master(master) else "")
    matches = _new_matches(conn)
    picks = _guaranteed_picks(conn, {m["id"] for m in matches}) if GUARANTEED_PICKS else []
    log(f"{len(matches)} new ≥{MIN_SCORE}% match(es); {len(picks)} guaranteed top-pick(s) "
        f"from direct-company sources, to {to}")
    if not matches and not picks:
        log("Nothing new today. Done.")
        return 0
    if len(matches) > MAX_JOBS - len(picks):
        keep = max(MAX_JOBS - len(picks), 0)
        log(f"capping ≥{MIN_SCORE}% matches to {keep} of {len(matches)} (rest will send next run; "
            f"guaranteed picks are never dropped by this cap)")
        matches = matches[:keep]

    attachments, rows_html, pick_rows_html, sent_ids = [], [], [], []
    for job in matches + picks:
        company, title = job.get("company", ""), job.get("title", "")
        try:
            res = {}
            if TAILOR:
                res = tailor_master_resume(master, job, settings)
            if TAILOR and not res.get("error"):
                rbytes = master_resume_to_docx(
                    res.get("name") or os.environ.get("CANDIDATE_NAME", ""),
                    res.get("contact", ""), res.get("target_title", ""), res.get("sections", []))
                attachments.append({"filename": f"resume_{slug(company)}_{slug(title)}.docx",
                                    "content": base64.b64encode(rbytes).decode()})
            cl = {}
            if TAILOR:
                cl = generate_cover_letter(
                    title=title, company=company, location=job.get("location", ""),
                    department=job.get("department", ""),
                    description=job.get("description_snippet", "") or job.get("description_full", ""),
                    resume_text=master,
                    cover_letter_samples=profile.get("cover_letter_samples"), settings=settings)
            if TAILOR and not cl.get("error") and cl.get("cover_letter"):
                cbytes = cover_to_docx(cl["cover_letter"], os.environ.get("CANDIDATE_NAME", ""),
                                       res.get("contact", ""), company)
                attachments.append({"filename": f"cover_{slug(company)}_{slug(title)}.docx",
                                    "content": base64.b64encode(cbytes).decode()})
            score = job.get("llm_score")
            wt = job.get("workplace_type") or ""
            loc = job.get("location") or ("Remote" if job.get("remote") else "Location not stated")
            if wt and wt.lower() != "remote" and wt.lower() not in loc.lower():
                loc = f"{loc} · {wt}"
            url = job.get("url") or "#"
            pick_source = job.get("_guaranteed_pick_source")
            if pick_source:
                badge = f'<span style="color:#b45309">· {score}% · top pick, below the {MIN_SCORE}% bar</span>'
            else:
                badge = f'<span style="color:#16a34a">· {score}%</span>'
            row = (
                f'<tr><td style="padding:10px 0;border-bottom:1px solid #eee">'
                f'<div style="font-weight:600;color:#111">{title} {badge}</div>'
                f'<div style="color:#555;font-size:13px">{company} · {loc}</div>'
                f'<a href="{url}" style="font-size:12px;color:#2563eb">View posting →</a></td></tr>')
            (pick_rows_html if pick_source else rows_html).append(row)
            sent_ids.append(job["id"])
            log(f"  prepared {title} @ {company} ({score}%)"
                + (f" [guaranteed pick: {pick_source}]" if pick_source else ""))
        except Exception as e:  # noqa: BLE001
            log(f"  skip {title} @ {company}: {e}")
        if TAILOR:
            time.sleep(PACE_SECONDS)  # pace LLM calls — the vLLM is shared with trading

    if TAILOR and not attachments:
        log("No documents generated. Nothing sent.")
        return 4
    if not sent_ids:
        log("No matches prepared. Nothing sent.")
        return 4

    today = datetime.now(timezone.utc).strftime("%b %d")
    n_main, n_picks = len(rows_html), len(pick_rows_html)
    if n_main and n_picks:
        subject = f"Reverse-ATS — {n_main} new ≥{MIN_SCORE}% match(es) + {n_picks} top pick(s) ({today})"
    elif n_picks:
        subject = f"Reverse-ATS — {n_picks} top pick(s) from your target companies ({today})"
    else:
        subject = f"Reverse-ATS — {n_main} new ≥{MIN_SCORE}% match(es) ({today})"

    body = f'<div style="font-family:system-ui,Arial,sans-serif;max-width:620px">'
    if n_main:
        body += (
            f'<h2 style="color:#111">{n_main} new match(es) at ≥{MIN_SCORE}% fit</h2>'
            + (f'<p style="color:#555">Tailored résumé + cover letter attached for each (master-template tailoring).</p>'
               if attachments else
               f'<p style="color:#555">Ranked matches only — tailoring is off (DIGEST_TAILOR=0).</p>')
            + f'<table style="width:100%;border-collapse:collapse">{"".join(rows_html)}</table>')
    if n_picks:
        body += (
            f'<h2 style="color:#111;margin-top:{"28px" if n_main else "0"}">Today\'s top pick(s) from your target companies</h2>'
            f'<p style="color:#555">Below the {MIN_SCORE}% bar, shown anyway so a strong local/direct-company '
            f'match never goes silent — one per source, real score shown, never implied to be a {MIN_SCORE}%+ fit.</p>'
            f'<table style="width:100%;border-collapse:collapse">{"".join(pick_rows_html)}</table>')
    body += (f'<p style="color:#999;font-size:12px;margin-top:16px">Your private Reverse-ATS instance · '
             f'{len(attachments)} attachment(s)</p></div>')
    html = body

    if _send(base, secret, to, subject, html, attachments):
        now = datetime.now(timezone.utc).isoformat()
        conn.executemany("INSERT OR REPLACE INTO digest_log (job_id, sent_at) VALUES (?, ?)",
                         [(jid, now) for jid in sent_ids])
        conn.commit()
        log(f"SENT {len(sent_ids)} job(s), {len(attachments)} attachment(s) to {to}")
        return 0
    log("send failed — not marking jobs as emailed (will retry next run)")
    return 5


if __name__ == "__main__":
    sys.exit(main())
