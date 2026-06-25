#!/usr/bin/env python3
"""Drain the job-preprocessing backlog from GX10 using a free local LLM.

Why this exists
---------------
The Worker's structured-extraction step (cloudflare/src/preprocess.ts) runs on
Cloudflare Workers AI, whose free tier (~10K neurons/day) is the throughput
bottleneck: with a 20K+ job backlog, only ~13% of jobs ever got structured +
embedded, so 87% of jobs were invisible to the matched feed (cosine = 0).

This script moves the expensive LLM extraction off-box onto GX10's free local
LLM (Qwen3.6 on :8093, residential IP, $0). It:

  1. GET  /preprocess/pending  — pulls jobs with no jobs_structured row
  2. runs the SAME extraction schema/prompt as preprocess.ts against the local
     OpenAI-compatible LLM endpoint
  3. POST /preprocess/results  — hands structured JSON back to the Worker, which
     embeds it on Workers AI bge-m3 (cheap) so vectors stay in one space

Embedding stays on the Worker on purpose — never embed here, or job vectors
would drift from the user's resume embedding and cosine matching breaks.

Required env
------------
  CF_BASE_URL       e.g. https://reverse-ats-ingest.aries-lao.workers.dev
  CF_INGEST_SECRET  same value set via `wrangler secret put INGEST_SECRET`

Optional env
------------
  LLM_BASE_URL      OpenAI-compatible base, default http://localhost:8093/v1
  LLM_MODEL         model name, default "qwen3.6-35b"
  BATCH_LIMIT       jobs to pull per run, default 100 (Worker caps at 500)
  REVERSE_ATS_LOG_LEVEL  defaults to INFO

Cron suggestion (deploy via safe-crontab — see CLAUDE.md):
  */20 * * * * cd /mnt/crucial-x10/projects/reverse-ats && \
    CF_BASE_URL=https://reverse-ats-ingest.aries-lao.workers.dev \
    CF_INGEST_SECRET=… .venv/bin/python scripts/preprocess_backlog_gx10.py \
    >> /mnt/crucial-x10/projects/reverse-ats/logs/preprocess_backlog.log 2>&1
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
from typing import Any
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

# ── Extraction schema/prompt — kept in lockstep with cloudflare/src/preprocess.ts ──

SYSTEM_PROMPT = """You extract structured information from job postings.

Read the posting carefully and output ONLY valid JSON in this exact shape:

{
  "seniority": "<one of: junior, mid, senior, principal, staff, director, vp, c_level, or null if unclear>",
  "years_experience_min": <integer or null>,
  "must_have_skills": ["<skill1>", "<skill2>", ... up to 12],
  "nice_to_have_skills": ["<skill1>", ...],
  "responsibilities": ["<short bullet1>", "<short bullet2>", ... up to 6],
  "comp_min": <integer USD annual or null>,
  "comp_max": <integer USD annual or null>,
  "remote_policy": "<one of: full_remote, hybrid, onsite, not_specified>",
  "industry_tags": ["<tag1>", "<tag2>", ... up to 4]
}

Rules:
- Skills must be specific (e.g. "Python", "PyTorch", "SQL"), not vague (not "programming")
- Responsibilities must be concise — under 12 words each, action-verb first
- For comp_min/comp_max, parse only explicit annual base salary in USD; equity / bonus / range with unclear units = null
- For industry_tags use lowercase snake_case (e.g. "fintech", "ai_ml", "healthcare")
- Output JSON only — no prose, no markdown fences
"""

SENIORITY = {"junior", "mid", "senior", "principal", "staff", "director", "vp", "c_level"}
REMOTE_POLICY = {"full_remote", "hybrid", "onsite", "not_specified"}


def _setup_logging() -> logging.Logger:
    level = os.environ.get("REVERSE_ATS_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    return logging.getLogger("reverse-ats.preprocess-gx10")


log = _setup_logging()


def _http_json(method: str, url: str, secret: str, payload: Any = None, timeout: int = 60) -> Any:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urlrequest.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {secret}")
    # Cloudflare's edge bot-protection 403s the default Python-urllib UA, so
    # present a browser-like agent (same as scripts/discover_ats_slugs.py).
    req.add_header("User-Agent", "Mozilla/5.0 (reverse-ats-gx10)")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urlrequest.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _parse_json_loose(text: str) -> Any:
    """Direct parse; fall back to first balanced {...} block (mirrors preprocess.ts)."""
    if not text:
        return None
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", cleaned)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if 0 <= start < end:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                return None
    return None


def _clean_arr(v: Any, max_n: int) -> list[str]:
    if not isinstance(v, list):
        return []
    out = []
    for x in v:
        if isinstance(x, str):
            s = x.strip()
            if 0 < len(s) < 80:
                out.append(s)
    return out[:max_n]


def _clean_int(v: Any) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return round(v)
    if isinstance(v, str):
        digits = re.sub(r"[^\d-]", "", v)
        try:
            return int(digits)
        except ValueError:
            return None
    return None


def _clean_str(v: Any, allowed: set[str]) -> str | None:
    if not isinstance(v, str):
        return None
    s = v.strip().lower()
    if not s or s not in allowed:
        return None
    return s


def _normalize(raw: dict) -> dict:
    return {
        "seniority": _clean_str(raw.get("seniority"), SENIORITY),
        "years_experience_min": _clean_int(raw.get("years_experience_min")),
        "must_have_skills": _clean_arr(raw.get("must_have_skills"), 12),
        "nice_to_have_skills": _clean_arr(raw.get("nice_to_have_skills"), 12),
        "responsibilities": _clean_arr(raw.get("responsibilities"), 6),
        "comp_min": _clean_int(raw.get("comp_min")),
        "comp_max": _clean_int(raw.get("comp_max")),
        "remote_policy": _clean_str(raw.get("remote_policy"), REMOTE_POLICY),
        "industry_tags": _clean_arr(raw.get("industry_tags"), 4),
    }


def _extract(llm_base: str, model: str, job: dict, timeout: int = 90) -> dict | None:
    description = (job.get("description") or "").strip()
    if not description:
        return None
    user_prompt = (
        "Job posting:\n\n"
        f"Title: {job.get('title')}\n"
        f"Company: {job.get('company')}\n"
        f"Description:\n{description[:6000]}\n\n"
        "Extract structured fields per the system instructions."
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 800,
        "temperature": 0.1,
        # vLLM/OpenAI-compatible: nudge to raw JSON, no chain-of-thought.
        "response_format": {"type": "json_object"},
    }
    req = urlrequest.Request(
        llm_base.rstrip("/") + "/chat/completions",
        data=json.dumps(payload).encode(),
        method="POST",
    )
    req.add_header("Content-Type", "application/json")
    with urlrequest.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode())
    content = (body.get("choices") or [{}])[0].get("message", {}).get("content", "")
    parsed = _parse_json_loose(content)
    if not isinstance(parsed, dict):
        return None
    return _normalize(parsed)


def main() -> int:
    base = os.environ.get("CF_BASE_URL", "").rstrip("/")
    secret = os.environ.get("CF_INGEST_SECRET", "")
    if not base or not secret:
        log.error("CF_BASE_URL and CF_INGEST_SECRET are required")
        return 2
    llm_base = os.environ.get("LLM_BASE_URL", "http://localhost:8093/v1")
    model = os.environ.get("LLM_MODEL", "qwen3.6-35b")
    limit = int(os.environ.get("BATCH_LIMIT", "100"))

    t0 = time.time()
    try:
        pending = _http_json("GET", f"{base}/preprocess/pending?limit={limit}", secret)
    except (HTTPError, URLError) as e:
        log.error("failed to fetch pending jobs: %s", e)
        return 1
    jobs = pending.get("jobs", []) if isinstance(pending, dict) else []
    if not jobs:
        log.info("no pending jobs — backlog clear")
        return 0
    log.info("pulled %d pending jobs", len(jobs))

    results: list[dict] = []
    ok = 0
    for i, job in enumerate(jobs, 1):
        try:
            structured = _extract(llm_base, model, job)
            if structured:
                results.append({"job_id": job["id"], "structured": structured})
                ok += 1
            else:
                results.append({"job_id": job["id"], "error": "no structured output"})
        except (HTTPError, URLError, TimeoutError) as e:
            results.append({"job_id": job["id"], "error": f"llm call failed: {e}"})
        if i % 25 == 0:
            log.info("  extracted %d/%d", i, len(jobs))

    try:
        resp = _http_json("POST", f"{base}/preprocess/results", secret, {"results": results}, timeout=120)
    except (HTTPError, URLError) as e:
        log.error("failed to POST results: %s", e)
        return 1

    log.info(
        "done: extracted=%d/%d stored=%s failed=%s (%.1fs)",
        ok,
        len(jobs),
        resp.get("stored"),
        resp.get("failed"),
        time.time() - t0,
    )
    if resp.get("errors"):
        for err in resp["errors"][:10]:
            log.warning("  worker error: %s", err)
    return 0


if __name__ == "__main__":
    sys.exit(main())
