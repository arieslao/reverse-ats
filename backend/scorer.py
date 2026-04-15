#!/usr/bin/env python3
"""
Multi-provider LLM job relevance scorer.

Supports: OpenAI, Anthropic, Ollama, any OpenAI-compatible endpoint, or
keyword-only fallback. Configure your provider in Admin → LLM Settings.

Quick start:
    1. Run the web UI and go to Admin → LLM Settings
    2. Pick your provider and paste in your API key (if required)
    3. Set your resume in Admin → Profile
    4. Rescore jobs from the Jobs tab

Supported providers
-------------------
openai            — OpenAI API (GPT-4o, GPT-4o-mini, etc.)
anthropic         — Anthropic API (Claude Sonnet, Haiku, etc.)
ollama            — Ollama running locally (no API key needed)
openai_compatible — Any OpenAI-compatible endpoint: llama.cpp server,
                    vLLM, LiteLLM, Groq, Together AI, Fireworks AI, etc.
keyword_only      — No LLM; pure keyword matching (free fallback)
"""

import json
import logging
import requests
from typing import Optional

logger = logging.getLogger("reverse-ats.scorer")

# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

PROVIDERS: dict[str, dict] = {
    "openai": {
        "name": "OpenAI",
        "default_url": "https://api.openai.com/v1/chat/completions",
        "default_model": "gpt-4o-mini",
        "requires_key": True,
        "format": "openai",
    },
    "anthropic": {
        "name": "Anthropic",
        "default_url": "https://api.anthropic.com/v1/messages",
        "default_model": "claude-haiku-4-20250514",
        "requires_key": True,
        "format": "anthropic",
    },
    "ollama": {
        "name": "Ollama (Local)",
        "default_url": "http://localhost:11434/v1/chat/completions",
        "default_model": "llama3.1:8b",
        "requires_key": False,
        "format": "openai",
    },
    "openai_compatible": {
        "name": "OpenAI-Compatible (llama.cpp, vLLM, LiteLLM, Groq, Together AI, etc.)",
        "default_url": "http://localhost:8080/v1/chat/completions",
        "default_model": "default",
        "requires_key": False,
        "format": "openai",
    },
    "keyword_only": {
        "name": "Keyword Only (No LLM)",
        "default_url": "",
        "default_model": "",
        "requires_key": False,
        "format": "none",
    },
}

REQUEST_TIMEOUT = 90  # seconds — LLMs on large prompts can be slow

# ---------------------------------------------------------------------------
# Default resume placeholder
# ---------------------------------------------------------------------------

DEFAULT_RESUME_SUMMARY = """
No resume configured yet.

Go to Admin → Profile and paste your resume or a summary of your background.
The scorer will use keyword matching only until a resume is provided.
"""

# ---------------------------------------------------------------------------
# Scoring prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are a job-fit evaluator. Score how well this job matches the candidate profile.\n\n"
    "Return ONLY valid JSON with this exact structure:\n"
    '{"score": <0-100>, "reasoning": "<2-3 sentence explanation>", '
    '"match_highlights": ["<strength1>", "<strength2>"], "concerns": ["<concern1>"]}\n\n'
    "Scoring guide:\n"
    "- 90-100: Perfect match — role, skills, seniority, and domain all align\n"
    "- 70-89: Strong match — most criteria align, minor gaps\n"
    "- 50-69: Moderate match — good skill overlap but some seniority/domain mismatch\n"
    "- 30-49: Weak match — partial skill overlap, different domain or level\n"
    "- 0-29: Poor match — wrong field, wrong level, or missing critical skills"
)

# ---------------------------------------------------------------------------
# Keyword scoring weights (used as fallback when LLM is unavailable)
#
# These weights are intentionally generic to cover common software/AI/ML
# engineering and leadership roles. Edit them to match your own background.
# Higher numbers = stronger signal for your target roles.
# ---------------------------------------------------------------------------

WEIGHTED_SKILLS: dict[str, int] = {
    # Core identity — very high weight
    "python": 5,
    "machine learning": 5,
    "ai": 4,
    "ml": 4,
    "llm": 5,
    "large language model": 5,
    "multi-agent": 5,
    "agent orchestration": 5,
    "inference": 4,
    "infrastructure": 3,
    # Engineering depth
    "typescript": 3,
    "react": 3,
    "data engineering": 3,
    "postgresql": 2,
    "fastapi": 3,
    "docker": 2,
    "kubernetes": 2,
    "real-time": 2,
    "streaming": 2,
    "distributed": 2,
    "api": 1,
    "websocket": 2,
    # Domain fit
    "healthcare": 4,
    "hipaa": 4,
    "fintech": 3,
    "financial": 2,
    "quantitative": 2,
    # Seniority signals
    "director": 4,
    "vp ": 5,
    "vice president": 5,
    "head of": 5,
    "principal": 4,
    "staff engineer": 4,
    "architect": 4,
    "engineering manager": 5,
    "technical program manager": 4,
    "program manager": 3,
    "solutions architect": 4,
    # Role type alignment
    "mlops": 4,
    "platform engineering": 3,
    "llmops": 5,
    "ai infrastructure": 5,
    "ai platform": 4,
    "model deployment": 4,
    "feature engineering": 3,
    "xgboost": 3,
    "deep learning": 3,
}

# Normalization scale factor: 1.5 so scoring doesn't require every keyword
# to match for a job to reach a meaningful score.
_KEYWORD_TOTAL = sum(WEIGHTED_SKILLS.values())
_KEYWORD_SCALE = 1.5


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

def check_inference_health(settings: Optional[dict] = None) -> dict:
    """
    Check whether the configured LLM provider is reachable.

    Args:
        settings: Provider settings dict (same shape as passed to score_job).
                  If None or provider is "keyword_only", returns healthy=True
                  immediately since no network call is needed.

    Returns:
        {
            "healthy": bool,
            "provider": str,
            "message": str,
        }
    """
    if not settings or settings.get("provider") == "keyword_only":
        return {
            "healthy": True,
            "provider": "keyword_only",
            "message": "Keyword scoring active (no LLM configured)",
        }

    provider = settings.get("provider", "openai_compatible")
    provider_info = PROVIDERS.get(provider, PROVIDERS["openai_compatible"])
    url = settings.get("api_url") or provider_info["default_url"]

    # OpenAI-format: probe the /models sibling endpoint
    if provider_info["format"] == "openai":
        health_url = url.replace("/chat/completions", "/models")
        headers: dict[str, str] = {}
        api_key = settings.get("api_key")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        try:
            resp = requests.get(health_url, headers=headers, timeout=5)
            resp.raise_for_status()
            return {
                "healthy": True,
                "provider": provider,
                "message": f"{provider_info['name']} is reachable",
            }
        except Exception as exc:
            return {
                "healthy": False,
                "provider": provider,
                "message": f"{provider_info['name']}: {exc}",
            }

    # Anthropic: can't easily probe without spending tokens, so just verify
    # the API key is present.
    if provider_info["format"] == "anthropic":
        if not settings.get("api_key"):
            return {
                "healthy": False,
                "provider": provider,
                "message": "Anthropic API key not configured",
            }
        return {
            "healthy": True,
            "provider": provider,
            "message": "Anthropic configured (key present)",
        }

    return {
        "healthy": False,
        "provider": provider,
        "message": f"Unknown provider format: {provider_info.get('format')}",
    }


# ---------------------------------------------------------------------------
# Primary scorer
# ---------------------------------------------------------------------------

def score_job(
    title: str,
    company: str,
    location: str,
    department: str,
    description: str,
    resume_text: Optional[str] = None,
    target_roles: Optional[list[str]] = None,
    must_have_skills: Optional[list[str]] = None,
    nice_to_have_skills: Optional[list[str]] = None,
    settings: Optional[dict] = None,
) -> dict:
    """
    Score a single job posting 0–100 for fit against the candidate profile.

    Tries the configured LLM provider first. Falls back to keyword scoring on
    any connection error, timeout, HTTP error, or unparseable LLM output.

    Args:
        title:               Job title.
        company:             Employer name.
        location:            Location string (may be empty).
        department:          Department / team name (may be empty).
        description:         Full or snippet job description text.
        resume_text:         Candidate resume / profile text. Falls back to
                             DEFAULT_RESUME_SUMMARY if not provided.
        target_roles:        List of role types the candidate is targeting.
        must_have_skills:    Skills required for the candidate to consider a role.
        nice_to_have_skills: Preferred-but-optional skills.
        settings:            LLM provider settings dict with keys:
                               provider    — one of the PROVIDERS keys above
                               api_key     — API key (required for openai/anthropic)
                               api_url     — override the default endpoint URL
                               model       — model name/alias
                               temperature — float, default 0.1
                               max_tokens  — int, default 500

    Returns:
        {
            "score": int (0–100),
            "reasoning": str,
            "match_highlights": list[str],
            "concerns": list[str],
        }
    """
    # No settings or explicit keyword_only → skip the network entirely
    if not settings or settings.get("provider") == "keyword_only":
        return _keyword_fallback(title, description, "no LLM configured")

    provider = settings.get("provider", "openai_compatible")
    provider_info = PROVIDERS.get(provider, PROVIDERS["openai_compatible"])

    # Guard: provider requires a key but none is set
    if provider_info["requires_key"] and not settings.get("api_key"):
        logger.warning("Provider %s requires an API key — keyword fallback", provider)
        return _keyword_fallback(title, description, f"{provider_info['name']} API key not set")

    user_prompt = _build_user_prompt(
        resume_text or DEFAULT_RESUME_SUMMARY,
        target_roles,
        must_have_skills,
        nice_to_have_skills,
        title,
        company,
        location,
        department,
        description,
    )

    try:
        if provider_info["format"] == "openai":
            return _call_openai_format(user_prompt, settings, provider_info)
        elif provider_info["format"] == "anthropic":
            return _call_anthropic_format(user_prompt, settings, provider_info)
        else:
            raise ValueError(f"Unknown provider format: {provider_info['format']}")

    except requests.ConnectionError as exc:
        logger.info("LLM provider unreachable (%s) — keyword fallback", exc)
        return _keyword_fallback(title, description, f"connection error: {exc}")
    except requests.Timeout:
        logger.warning("LLM provider timed out after %ds — keyword fallback", REQUEST_TIMEOUT)
        return _keyword_fallback(title, description, "request timeout")
    except requests.HTTPError as exc:
        logger.warning("LLM provider HTTP error %s — keyword fallback", exc)
        return _keyword_fallback(title, description, f"HTTP {exc.response.status_code}")
    except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
        logger.warning("Failed to parse LLM response (%s) — keyword fallback", exc)
        return _keyword_fallback(title, description, f"parse error: {exc}")
    except Exception as exc:
        logger.warning("Unexpected scorer error (%s) — keyword fallback", exc)
        return _keyword_fallback(title, description, str(exc))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_user_prompt(
    profile: str,
    target_roles: Optional[list[str]],
    must_have_skills: Optional[list[str]],
    nice_to_have_skills: Optional[list[str]],
    title: str,
    company: str,
    location: str,
    department: str,
    description: str,
) -> str:
    target_str = json.dumps(target_roles) if target_roles else "Not specified"
    must_str = json.dumps(must_have_skills) if must_have_skills else "Not specified"
    nice_str = json.dumps(nice_to_have_skills) if nice_to_have_skills else "Not specified"

    return (
        f"## Candidate Profile\n{profile}\n\n"
        f"## Target Roles\n{target_str}\n\n"
        f"## Must-Have Skills\n{must_str}\n\n"
        f"## Nice-to-Have Skills\n{nice_str}\n\n"
        f"## Job Posting\n"
        f"Company: {company}\n"
        f"Title: {title}\n"
        f"Location: {location}\n"
        f"Department: {department}\n\n"
        f"Description:\n{description[:3000]}\n\n"
        "Score this job for fit."
    )


def _call_openai_format(user_prompt: str, settings: dict, provider_info: dict) -> dict:
    """
    Call an OpenAI-compatible chat completions endpoint.

    Covers: OpenAI, Ollama, llama.cpp server, vLLM, LiteLLM proxy, Groq,
    Together AI, Fireworks AI, and any other OpenAI-compatible API.

    Raises requests exceptions on network/HTTP failures so score_job can
    handle them uniformly.
    """
    url = settings.get("api_url") or provider_info["default_url"]
    model = settings.get("model") or provider_info["default_model"]
    temperature = settings.get("temperature", 0.1)
    max_tokens = settings.get("max_tokens", 500)

    headers: dict[str, str] = {"Content-Type": "application/json"}
    api_key = settings.get("api_key")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    resp = requests.post(
        url,
        headers=headers,
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"].strip()
    return _parse_llm_response(content)


def _call_anthropic_format(user_prompt: str, settings: dict, provider_info: dict) -> dict:
    """
    Call the Anthropic Messages API.

    Uses x-api-key header and the anthropic-version handshake required by the
    Anthropic API. System prompt is passed as a top-level "system" field.

    Raises requests exceptions on network/HTTP failures so score_job can
    handle them uniformly.
    """
    url = settings.get("api_url") or provider_info["default_url"]
    model = settings.get("model") or provider_info["default_model"]
    temperature = settings.get("temperature", 0.1)
    max_tokens = settings.get("max_tokens", 500)
    api_key = settings.get("api_key", "")

    resp = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        json={
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_prompt}],
        },
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()

    content = resp.json()["content"][0]["text"].strip()
    return _parse_llm_response(content)


def _parse_llm_response(content: str) -> dict:
    """
    Parse the raw text from an LLM into a validated score dict.

    Handles markdown code fences (```json ... ```) that some models emit
    around JSON output.
    """
    if content.startswith("```"):
        lines = content.split("\n")
        inner = [line for line in lines[1:] if line.strip() != "```"]
        content = "\n".join(inner).strip()

    result = json.loads(content)
    return _validate_result(result)


def _validate_result(result: dict) -> dict:
    """Ensure all required keys exist and the score is clamped to [0, 100]."""
    score = result.get("score", 0)
    try:
        score = max(0, min(100, int(score)))
    except (ValueError, TypeError):
        score = 0

    return {
        "score": score,
        "reasoning": str(result.get("reasoning", "")).strip(),
        "match_highlights": list(result.get("match_highlights", [])),
        "concerns": list(result.get("concerns", [])),
    }


# ---------------------------------------------------------------------------
# Cover letter generation
# ---------------------------------------------------------------------------

COVER_LETTER_SYSTEM_PROMPT = """You are an expert career coach and professional writer. Generate a concise, compelling cover letter that positions the candidate as a strong fit for this specific role.

Guidelines:
- Keep it to 3-4 short paragraphs (250-350 words total)
- Opening: State the specific role and company, and one compelling reason you're a great fit
- Middle: Connect 2-3 of the candidate's most relevant achievements/skills directly to the job requirements. Use specific metrics and outcomes from the resume, not generic claims
- Closing: Express enthusiasm and a clear call to action
- Tone: Professional but warm, confident but not arrogant
- Do NOT use cliches like "I am writing to express my interest" or "I believe I would be a great fit"
- Do NOT fabricate experience — only reference what's in the resume
- Tailor the language to the company's industry and culture
- If the candidate's resume is missing or minimal, write a shorter letter focused on transferable skills

Return ONLY the cover letter text. No JSON, no markdown headers, no "Dear Hiring Manager" unless it fits naturally. Start with a strong opening sentence."""


def generate_cover_letter(
    title: str,
    company: str,
    location: str,
    department: str,
    description: str,
    resume_text: Optional[str] = None,
    target_roles: Optional[list[str]] = None,
    must_have_skills: Optional[list[str]] = None,
    nice_to_have_skills: Optional[list[str]] = None,
    settings: Optional[dict] = None,
) -> dict:
    """
    Generate a personalized cover letter for a specific job posting.

    Returns: {"cover_letter": str, "provider": str, "error": str|None}
    """
    if not settings or settings.get("provider") == "keyword_only":
        return {
            "cover_letter": "",
            "provider": "keyword_only",
            "error": "Cover letter generation requires an LLM provider. Configure one in Admin → LLM Settings.",
        }

    provider = settings.get("provider", "openai_compatible")
    provider_info = PROVIDERS.get(provider, PROVIDERS["openai_compatible"])

    if provider_info["requires_key"] and not settings.get("api_key"):
        return {
            "cover_letter": "",
            "provider": provider,
            "error": f"{provider_info['name']} API key not configured. Go to Admin → LLM Settings.",
        }

    profile = resume_text or "No resume provided. Please add your resume in Admin → Profile."
    target_str = json.dumps(target_roles) if target_roles else "Not specified"
    must_str = json.dumps(must_have_skills) if must_have_skills else "Not specified"
    nice_str = json.dumps(nice_to_have_skills) if nice_to_have_skills else "Not specified"

    user_prompt = (
        f"## Candidate Resume\n{profile}\n\n"
        f"## Candidate's Target Roles\n{target_str}\n\n"
        f"## Candidate's Key Skills\nMust-have: {must_str}\nNice-to-have: {nice_str}\n\n"
        f"## Job Posting\nCompany: {company}\nTitle: {title}\n"
        f"Location: {location}\nDepartment: {department}\n\n"
        f"Description:\n{description[:4000]}\n\n"
        f"Write a cover letter for this specific role."
    )

    try:
        # Use higher max_tokens for cover letters (need ~400 tokens for 300 words)
        cl_settings = {**settings, "max_tokens": 800, "temperature": 0.4}

        if provider_info["format"] == "openai":
            result = _call_llm_raw(user_prompt, COVER_LETTER_SYSTEM_PROMPT, cl_settings, provider_info)
        elif provider_info["format"] == "anthropic":
            result = _call_llm_raw_anthropic(user_prompt, COVER_LETTER_SYSTEM_PROMPT, cl_settings, provider_info)
        else:
            return {"cover_letter": "", "provider": provider, "error": "Unsupported provider format"}

        return {"cover_letter": result.strip(), "provider": provider, "error": None}

    except Exception as e:
        logger.warning("Cover letter generation failed: %s", e)
        return {"cover_letter": "", "provider": provider, "error": str(e)}


def _call_llm_raw(user_prompt: str, system_prompt: str, settings: dict, provider_info: dict) -> str:
    """Call OpenAI-compatible API and return raw text content."""
    url = settings.get("api_url") or provider_info["default_url"]
    model = settings.get("model") or provider_info["default_model"]
    temperature = settings.get("temperature", 0.4)
    max_tokens = settings.get("max_tokens", 800)

    headers = {"Content-Type": "application/json"}
    api_key = settings.get("api_key")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    resp = requests.post(url, headers=headers, json={
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def _call_llm_raw_anthropic(user_prompt: str, system_prompt: str, settings: dict, provider_info: dict) -> str:
    """Call Anthropic Messages API and return raw text content."""
    url = settings.get("api_url") or provider_info["default_url"]
    model = settings.get("model") or provider_info["default_model"]
    temperature = settings.get("temperature", 0.4)
    max_tokens = settings.get("max_tokens", 800)
    api_key = settings.get("api_key", "")

    resp = requests.post(url, headers={
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }, json={
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()["content"][0]["text"].strip()


# ---------------------------------------------------------------------------
# Keyword fallback
# ---------------------------------------------------------------------------

def _keyword_fallback(title: str, description: str, error_reason: str) -> dict:
    """
    Keyword-weighted scoring used when the LLM is unavailable or not configured.

    Scores based on the presence of skill/role keywords in the job title and
    description, weighted by the WEIGHTED_SKILLS dict. Edit that dict to match
    your own background for better keyword-only accuracy.

    Scores are scaled so a strong-but-not-exhaustive keyword match still
    produces a meaningful result rather than a tiny fraction.
    """
    text = (title + " " + description).lower()

    hit_keywords: list[str] = []
    raw_score = 0
    for keyword, weight in WEIGHTED_SKILLS.items():
        if keyword in text:
            raw_score += weight
            hit_keywords.append(keyword)

    normalized = min(100, round((raw_score / _KEYWORD_TOTAL) * 100 * _KEYWORD_SCALE))

    return {
        "score": normalized,
        "reasoning": (
            f"Keyword-based score (LLM unavailable: {error_reason}). "
            f"Matched {len(hit_keywords)} weighted keyword(s) out of "
            f"{len(WEIGHTED_SKILLS)} tracked."
        ),
        "match_highlights": hit_keywords,
        "concerns": [
            "LLM scoring unavailable — keyword fallback used; "
            "accuracy is lower than LLM scoring"
        ],
    }


# ---------------------------------------------------------------------------
# Batch scorer
# ---------------------------------------------------------------------------

def score_batch(
    jobs: list[dict],
    profile: Optional[dict] = None,
    settings: Optional[dict] = None,
) -> list[dict]:
    """
    Score a batch of job dicts.

    Args:
        jobs:     List of job dicts. Each must have at least "title" and
                  "company". Optional fields: location, department,
                  description_snippet, description_full, id.
        profile:  Candidate profile dict (mirrors the DB profile row):
                    resume_text         — plain-text resume or summary
                    target_roles        — JSON string or list of role types
                    must_have_skills    — JSON string or list
                    nice_to_have_skills — JSON string or list
        settings: LLM provider settings dict (see score_job for keys).
                  Pass None or omit to use keyword-only fallback.

    Returns:
        List of score dicts, each with an added "job_id" key.
    """
    resume = profile.get("resume_text") if profile else None
    targets = _safe_json_list(profile.get("target_roles")) if profile else None
    musts = _safe_json_list(profile.get("must_have_skills")) if profile else None
    nices = _safe_json_list(profile.get("nice_to_have_skills")) if profile else None

    results = []
    for job in jobs:
        description = job.get("description_snippet") or job.get("description_full") or ""
        result = score_job(
            title=job.get("title", ""),
            company=job.get("company", ""),
            location=job.get("location", ""),
            department=job.get("department", ""),
            description=description,
            resume_text=resume,
            target_roles=targets,
            must_have_skills=musts,
            nice_to_have_skills=nices,
            settings=settings,
        )
        result["job_id"] = job.get("id", "")
        results.append(result)

    return results


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _safe_json_list(val) -> Optional[list]:
    """Parse a value that may be a JSON string, a list, or None into a list."""
    if val is None:
        return None
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, list) else None
        except (json.JSONDecodeError, TypeError):
            return None
    return None


# ---------------------------------------------------------------------------
# CLI smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    print(__doc__)
    print("=" * 60)
    print("Running a keyword-only smoke test (no LLM needed)...")
    print()

    result = score_job(
        title="Staff AI Engineer",
        company="Acme Corp",
        location="Remote, US",
        department="AI Platform",
        description=(
            "We're looking for a Staff AI Engineer to build and operate our LLM inference "
            "infrastructure. You'll design multi-agent pipelines, own model deployment with "
            "llama.cpp and vLLM, and partner with product to ship AI features at scale. "
            "Python, FastAPI, Docker, and Kubernetes required."
        ),
        settings={"provider": "keyword_only"},
    )

    print(f"Score:      {result['score']}")
    print(f"Reasoning:  {result['reasoning']}")
    print(f"Highlights: {result['match_highlights']}")
    print(f"Concerns:   {result['concerns']}")
    print()
    print("To test with a live LLM, pass a settings dict to score_job().")
    print("See PROVIDERS dict in this file for valid provider options.")
    sys.exit(0 if result["score"] > 0 else 1)
