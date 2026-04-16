"""
SQLite database layer for Reverse ATS.
Uses stdlib sqlite3 only — no ORM dependencies.

Path resolution:
  - Production: set REVERSE_ATS_DB_PATH env var to your preferred location
  - Local dev fallback: <this file's directory>/reverse_ats.db
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

LOCAL_DB_PATH = Path(__file__).parent / "reverse_ats.db"


def get_db_path() -> str:
    """Return DB path from env var if set, else local dev fallback."""
    env_path = os.environ.get("REVERSE_ATS_DB_PATH")
    if env_path:
        p = Path(env_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        return str(p)
    return str(LOCAL_DB_PATH)


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def get_connection(db_path: str = None) -> sqlite3.Connection:
    """
    Open a SQLite connection with:
      - row_factory = sqlite3.Row  (column-name access)
      - WAL journal mode           (concurrent reads during writes)
      - Foreign keys enforced
      - 30-second busy timeout     (handles brief write contention)
    """
    path = db_path or get_db_path()
    conn = sqlite3.connect(path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")   # safe with WAL, faster than FULL
    return conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id                  TEXT PRIMARY KEY,
    company             TEXT NOT NULL,
    title               TEXT NOT NULL,
    location            TEXT,
    department          TEXT,
    url                 TEXT NOT NULL,
    description_snippet TEXT,
    description_full    TEXT,
    category            TEXT,
    ats_type            TEXT,
    remote              INTEGER NOT NULL DEFAULT 0,
    keyword_score       INTEGER NOT NULL DEFAULT 0,
    llm_score           INTEGER,
    llm_reasoning       TEXT,
    first_seen_at       TEXT NOT NULL,
    last_seen_at        TEXT NOT NULL,
    expired             INTEGER NOT NULL DEFAULT 0,
    dismissed           INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_category    ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_remote      ON jobs(remote);
CREATE INDEX IF NOT EXISTS idx_jobs_keyword_score ON jobs(keyword_score);
CREATE INDEX IF NOT EXISTS idx_jobs_expired     ON jobs(expired);
CREATE INDEX IF NOT EXISTS idx_jobs_dismissed   ON jobs(dismissed);
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen   ON jobs(last_seen_at);

CREATE TABLE IF NOT EXISTS pipeline (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    stage           TEXT NOT NULL DEFAULT 'saved',
    applied_at      TEXT,
    notes           TEXT,
    contact_name    TEXT,
    contact_email   TEXT,
    contact_role    TEXT,
    next_step       TEXT,
    next_step_date  TEXT,
    salary_offered  INTEGER,
    cover_letter    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(job_id)   -- one pipeline entry per job
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stage  ON pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_job_id ON pipeline(job_id);

CREATE TABLE IF NOT EXISTS pipeline_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id INTEGER NOT NULL REFERENCES pipeline(id) ON DELETE CASCADE,
    from_stage  TEXT,
    to_stage    TEXT NOT NULL,
    note        TEXT,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_pipeline_id ON pipeline_events(pipeline_id);

CREATE TABLE IF NOT EXISTS profile (
    id                   INTEGER PRIMARY KEY CHECK(id = 1),
    resume_text          TEXT,
    target_roles         TEXT DEFAULT '[]',   -- JSON array
    target_locations     TEXT DEFAULT '[]',   -- JSON array
    remote_only          INTEGER NOT NULL DEFAULT 1,
    min_seniority        TEXT,
    salary_min           INTEGER,
    salary_max           INTEGER,
    must_have_skills     TEXT DEFAULT '[]',   -- JSON array
    nice_to_have_skills  TEXT DEFAULT '[]',   -- JSON array
    blacklisted_companies  TEXT DEFAULT '[]', -- JSON array
    blacklisted_keywords   TEXT DEFAULT '[]', -- JSON array
    priority_categories    TEXT DEFAULT '[]', -- JSON array
    updated_at           TEXT
);

CREATE TABLE IF NOT EXISTS scrape_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at    TEXT NOT NULL,
    completed_at  TEXT,
    total_fetched INTEGER NOT NULL DEFAULT 0,
    new_jobs      INTEGER NOT NULL DEFAULT 0,
    updated_jobs  INTEGER NOT NULL DEFAULT 0,
    expired_jobs  INTEGER NOT NULL DEFAULT 0,
    llm_scored    INTEGER NOT NULL DEFAULT 0,
    errors        TEXT NOT NULL DEFAULT '[]'  -- JSON array of error strings
);

CREATE TABLE IF NOT EXISTS daily_digest (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL UNIQUE,           -- YYYY-MM-DD
    new_job_ids TEXT NOT NULL DEFAULT '[]',     -- JSON array of job ids
    top_matches TEXT NOT NULL DEFAULT '[]',     -- JSON array of {id, score, title, company}
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_digest_date ON daily_digest(date);

CREATE TABLE IF NOT EXISTS companies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    ats         TEXT NOT NULL DEFAULT 'greenhouse',  -- greenhouse, lever, ashby, workday, custom
    slug        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'fintech',     -- big_tech, fintech, ai_tech, healthtech, quant
    enabled     INTEGER NOT NULL DEFAULT 1,
    careers_url TEXT,        -- for custom ATS
    workday_url TEXT,        -- for workday ATS
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE(slug, ats)
);
CREATE INDEX IF NOT EXISTS idx_companies_category ON companies(category);
CREATE INDEX IF NOT EXISTS idx_companies_enabled ON companies(enabled);

CREATE TABLE IF NOT EXISTS llm_settings (
    id              INTEGER PRIMARY KEY CHECK(id = 1),
    provider        TEXT NOT NULL DEFAULT 'keyword_only',
    api_key         TEXT,
    api_url         TEXT,
    model           TEXT,
    temperature     REAL NOT NULL DEFAULT 0.1,
    max_tokens      INTEGER NOT NULL DEFAULT 500,
    updated_at      TEXT
);
"""


def init_db(db_path: str = None) -> None:
    """Create all tables and indexes if they do not exist."""
    path = db_path or get_db_path()
    # Ensure parent directory exists (important for GX10 state dir)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection(path)
    try:
        conn.executescript(_SCHEMA)
        conn.commit()
        # Migration: add cover_letter column if missing (existing DBs)
        try:
            conn.execute("ALTER TABLE pipeline ADD COLUMN cover_letter TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # column already exists
        seed_companies_from_scraper(conn)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return dict(row)


def _rows_to_list(rows) -> list[dict]:
    return [dict(r) for r in rows]


def job_id_hash(company: str, title: str, url: str) -> str:
    """
    Deterministic SHA-256 ID for deduplication.
    Normalises to lowercase before hashing so minor capitalisation
    differences don't create duplicate records.
    """
    raw = f"{company.lower().strip()}|{title.lower().strip()}|{url.strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _json_dumps(v) -> str:
    """Safely serialise a Python list to a JSON string."""
    if v is None:
        return "[]"
    if isinstance(v, str):
        return v  # already serialised (pass-through)
    return json.dumps(v)


def _clean_description(html_text: str) -> str:
    """Strip HTML tags and decode entities from ATS description text."""
    if not html_text:
        return ""
    # Decode HTML entities (&lt; &gt; &amp; &#39; etc.)
    # Double-decode to handle double-encoded entities like &amp;nbsp; → &nbsp; → actual space
    text = unescape(unescape(html_text))
    # Replace <br>, <br/>, </p>, </li> with newlines
    text = re.sub(r'<br\s*/?>|</p>|</li>|</div>', '\n', text, flags=re.IGNORECASE)
    # Replace <li> with bullet points
    text = re.sub(r'<li[^>]*>', '- ', text, flags=re.IGNORECASE)
    # Strip all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Clean up whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


# ---------------------------------------------------------------------------
# Job CRUD
# ---------------------------------------------------------------------------

def upsert_job(conn: sqlite3.Connection, job_data: dict) -> tuple[str, bool]:
    """
    Insert or update a job record.

    On INSERT: stores the full record.
    On CONFLICT (same id): updates last_seen_at, un-expires the job, and
    refreshes mutable fields (scores, snippet, location, etc.) while
    preserving first_seen_at and the dismissed flag.

    Returns:
        (job_id, is_new) — is_new=True if a new row was inserted.
    """
    now = _now_iso()
    company = job_data.get("company", "")
    title = job_data.get("title", "")
    url = job_data.get("url", "")
    job_id = job_data.get("id") or job_id_hash(company, title, url)

    existing = conn.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)).fetchone()
    is_new = existing is None

    if is_new:
        conn.execute(
            """
            INSERT INTO jobs (
                id, company, title, location, department, url,
                description_snippet, description_full, category, ats_type,
                remote, keyword_score, llm_score, llm_reasoning,
                first_seen_at, last_seen_at, expired, dismissed, created_at
            ) VALUES (
                :id, :company, :title, :location, :department, :url,
                :description_snippet, :description_full, :category, :ats_type,
                :remote, :keyword_score, :llm_score, :llm_reasoning,
                :first_seen_at, :last_seen_at, 0, 0, :created_at
            )
            """,
            {
                "id": job_id,
                "company": company,
                "title": title,
                "location": job_data.get("location"),
                "department": job_data.get("department"),
                "url": url,
                "description_snippet": _clean_description(job_data.get("description_snippet")),
                "description_full": _clean_description(job_data.get("description_full")),
                "category": job_data.get("category"),
                "ats_type": job_data.get("ats_type"),
                "remote": 1 if job_data.get("remote") else 0,
                "keyword_score": job_data.get("keyword_score", 0),
                "llm_score": job_data.get("llm_score"),
                "llm_reasoning": job_data.get("llm_reasoning"),
                "first_seen_at": job_data.get("first_seen_at", now),
                "last_seen_at": job_data.get("last_seen_at", now),
                "created_at": now,
            },
        )
    else:
        # Refresh mutable fields; never overwrite first_seen_at or dismissed
        conn.execute(
            """
            UPDATE jobs SET
                location            = COALESCE(:location, location),
                department          = COALESCE(:department, department),
                description_snippet = COALESCE(:description_snippet, description_snippet),
                description_full    = COALESCE(:description_full, description_full),
                category            = COALESCE(:category, category),
                ats_type            = COALESCE(:ats_type, ats_type),
                remote              = :remote,
                keyword_score       = :keyword_score,
                llm_score           = COALESCE(:llm_score, llm_score),
                llm_reasoning       = COALESCE(:llm_reasoning, llm_reasoning),
                last_seen_at        = :last_seen_at,
                expired             = 0
            WHERE id = :id
            """,
            {
                "id": job_id,
                "location": job_data.get("location"),
                "department": job_data.get("department"),
                "description_snippet": _clean_description(job_data.get("description_snippet")),
                "description_full": _clean_description(job_data.get("description_full")),
                "category": job_data.get("category"),
                "ats_type": job_data.get("ats_type"),
                "remote": 1 if job_data.get("remote") else 0,
                "keyword_score": job_data.get("keyword_score", 0),
                "llm_score": job_data.get("llm_score"),
                "llm_reasoning": job_data.get("llm_reasoning"),
                "last_seen_at": now,
            },
        )

    conn.commit()
    return job_id, is_new


def get_jobs(
    conn: sqlite3.Connection,
    page: int = 1,
    per_page: int = 50,
    remote_only: bool = True,
    min_score: int = 0,
    category: str = None,
    dismissed: bool = False,
    expired: bool = False,
    new_since: str = None,        # ISO datetime string
    search: str = None,           # free-text search against title + company
    sort_by: str = "score",       # score, newest, oldest, company, title
    exclude_companies: list[str] = None,
) -> tuple[list[dict], int]:
    """
    Paginated job listing with filters.
    Also LEFT JOINs the pipeline table to surface the current stage.

    Returns:
        (jobs, total_count)
    """
    conditions = []
    params: dict = {}

    if remote_only:
        conditions.append("j.remote = 1")

    if min_score > 0:
        conditions.append("COALESCE(j.llm_score, j.keyword_score) >= :min_score")
        params["min_score"] = min_score

    if category:
        conditions.append("j.category = :category")
        params["category"] = category

    # Default: exclude dismissed jobs
    conditions.append("j.dismissed = :dismissed")
    params["dismissed"] = 1 if dismissed else 0

    # Default: exclude expired jobs
    conditions.append("j.expired = :expired")
    params["expired"] = 1 if expired else 0

    if new_since:
        conditions.append("j.first_seen_at >= :new_since")
        params["new_since"] = new_since

    if search:
        conditions.append("(j.title LIKE :search OR j.company LIKE :search)")
        params["search"] = f"%{search}%"

    if exclude_companies:
        for idx, comp in enumerate(exclude_companies):
            needle = comp.strip().lower()
            if not needle:
                continue
            param_name = f"exc_comp_{idx}"
            conditions.append(f"LOWER(j.company) NOT LIKE :{param_name}")
            params[param_name] = f"%{needle}%"

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    order_clauses = {
        "score": "COALESCE(j.llm_score, j.keyword_score) DESC, j.first_seen_at DESC",
        "newest": "j.first_seen_at DESC",
        "oldest": "j.first_seen_at ASC",
        "company": "j.company ASC, j.title ASC",
        "title": "j.title ASC",
    }
    order = order_clauses.get(sort_by, order_clauses["score"])

    base_query = f"""
        FROM jobs j
        LEFT JOIN pipeline p ON p.job_id = j.id
        {where}
    """

    total: int = conn.execute(
        f"SELECT COUNT(*) {base_query}", params
    ).fetchone()[0]

    offset = (page - 1) * per_page
    params["limit"] = per_page
    params["offset"] = offset

    rows = conn.execute(
        f"""
        SELECT
            j.*,
            p.stage AS pipeline_stage
        {base_query}
        ORDER BY {order}
        LIMIT :limit OFFSET :offset
        """,
        params,
    ).fetchall()

    return _rows_to_list(rows), total


def get_job(conn: sqlite3.Connection, job_id: str) -> dict | None:
    """Fetch a single job with its current pipeline stage (if any)."""
    row = conn.execute(
        """
        SELECT j.*, p.stage AS pipeline_stage
        FROM jobs j
        LEFT JOIN pipeline p ON p.job_id = j.id
        WHERE j.id = ?
        """,
        (job_id,),
    ).fetchone()
    return _row_to_dict(row)


def dismiss_job(conn: sqlite3.Connection, job_id: str, dismissed: bool = True) -> bool:
    """
    Toggle the dismissed flag on a job.
    Returns True if a row was affected.
    """
    cursor = conn.execute(
        "UPDATE jobs SET dismissed = ? WHERE id = ?",
        (1 if dismissed else 0, job_id),
    )
    conn.commit()
    return cursor.rowcount > 0


def mark_expired(conn: sqlite3.Connection, seen_ids: set[str]) -> int:
    """
    Mark all active (non-expired) jobs whose IDs are NOT in seen_ids as expired.
    Used at the end of a scrape run to expire listings that have been taken down.

    Returns:
        Number of jobs newly marked expired.
    """
    if not seen_ids:
        # Safety: if seen_ids is empty, don't expire everything
        return 0

    placeholders = ",".join("?" * len(seen_ids))
    cursor = conn.execute(
        f"""
        UPDATE jobs
        SET expired = 1
        WHERE expired = 0
          AND id NOT IN ({placeholders})
        """,
        list(seen_ids),
    )
    conn.commit()
    return cursor.rowcount


# ---------------------------------------------------------------------------
# Pipeline CRUD
# ---------------------------------------------------------------------------

def create_pipeline_entry(
    conn: sqlite3.Connection,
    job_id: str,
    stage: str = "saved",
    notes: str = None,
) -> int:
    """
    Create a new pipeline entry for a job.
    Also inserts an initial pipeline_event recording the stage creation.

    Returns:
        pipeline.id (int)

    Raises:
        sqlite3.IntegrityError if a pipeline entry already exists for this job.
    """
    now = _now_iso()
    applied_at = now if stage == "applied" else None

    cursor = conn.execute(
        """
        INSERT INTO pipeline (job_id, stage, applied_at, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (job_id, stage, applied_at, notes, now, now),
    )
    pipeline_id = cursor.lastrowid

    conn.execute(
        """
        INSERT INTO pipeline_events (pipeline_id, from_stage, to_stage, note, created_at)
        VALUES (?, NULL, ?, ?, ?)
        """,
        (pipeline_id, stage, "Entry created", now),
    )
    conn.commit()
    return pipeline_id


def update_pipeline_entry(
    conn: sqlite3.Connection,
    pipeline_id: int,
    updates: dict,
) -> bool:
    """
    Apply partial updates to a pipeline entry.

    If 'stage' is in updates and differs from the current stage:
      - Records a pipeline_event capturing the transition.
      - Sets applied_at when transitioning into 'applied' for the first time.

    Returns:
        True if a row was updated, False if pipeline_id not found.
    """
    row = conn.execute(
        "SELECT * FROM pipeline WHERE id = ?", (pipeline_id,)
    ).fetchone()
    if row is None:
        return False

    current = dict(row)
    now = _now_iso()

    # Detect stage change
    new_stage = updates.get("stage")
    stage_changed = new_stage and new_stage != current["stage"]

    # Build SET clause dynamically from allowed mutable fields
    allowed = {
        "stage", "notes", "contact_name", "contact_email", "contact_role",
        "next_step", "next_step_date", "salary_offered", "cover_letter",
    }
    set_clauses = ["updated_at = :updated_at"]
    params: dict = {"updated_at": now, "pipeline_id": pipeline_id}

    for field in allowed:
        if field in updates and updates[field] is not None:
            set_clauses.append(f"{field} = :{field}")
            params[field] = updates[field]

    # Auto-set applied_at when first moving to applied
    if new_stage == "applied" and current.get("applied_at") is None:
        set_clauses.append("applied_at = :applied_at")
        params["applied_at"] = now

    conn.execute(
        f"UPDATE pipeline SET {', '.join(set_clauses)} WHERE id = :pipeline_id",
        params,
    )

    if stage_changed:
        note = updates.get("notes") or f"Stage changed to {new_stage}"
        conn.execute(
            """
            INSERT INTO pipeline_events (pipeline_id, from_stage, to_stage, note, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (pipeline_id, current["stage"], new_stage, note, now),
        )

    conn.commit()
    return True


def get_pipeline(conn: sqlite3.Connection) -> list[dict]:
    """
    Return all pipeline entries with their associated job data.
    Ordered by stage priority then most recently updated.
    """
    # Stage ordering mirrors the PipelineStage enum progression
    rows = conn.execute(
        """
        SELECT
            p.*,
            j.company, j.title, j.location, j.url,
            j.remote, j.keyword_score, j.llm_score,
            j.category, j.ats_type, j.first_seen_at, j.last_seen_at,
            j.description_snippet
        FROM pipeline p
        JOIN jobs j ON j.id = p.job_id
        ORDER BY
            CASE p.stage
                WHEN 'offer'        THEN 1
                WHEN 'final'        THEN 2
                WHEN 'technical'    THEN 3
                WHEN 'phone_screen' THEN 4
                WHEN 'applied'      THEN 5
                WHEN 'saved'        THEN 6
                WHEN 'discovered'   THEN 7
                WHEN 'rejected'     THEN 8
                WHEN 'withdrawn'    THEN 9
                ELSE 10
            END,
            p.updated_at DESC
        """
    ).fetchall()
    return _rows_to_list(rows)


def get_pipeline_events(conn: sqlite3.Connection, pipeline_id: int) -> list[dict]:
    """Return all events for a pipeline entry, oldest first."""
    rows = conn.execute(
        """
        SELECT * FROM pipeline_events
        WHERE pipeline_id = ?
        ORDER BY created_at ASC
        """,
        (pipeline_id,),
    ).fetchall()
    return _rows_to_list(rows)


# ---------------------------------------------------------------------------
# Profile CRUD
# ---------------------------------------------------------------------------

_JSON_PROFILE_FIELDS = {
    "target_roles", "target_locations", "must_have_skills",
    "nice_to_have_skills", "blacklisted_companies",
    "blacklisted_keywords", "priority_categories",
}

_DEFAULT_PROFILE: dict = {
    "id": 1,
    "resume_text": None,
    "target_roles": "[]",
    "target_locations": "[]",
    "remote_only": 1,
    "min_seniority": None,
    "salary_min": None,
    "salary_max": None,
    "must_have_skills": "[]",
    "nice_to_have_skills": "[]",
    "blacklisted_companies": "[]",
    "blacklisted_keywords": "[]",
    "priority_categories": "[]",
    "updated_at": None,
}


def _deserialise_profile(row: dict) -> dict:
    """Parse JSON string fields in a profile row into Python lists."""
    result = dict(row)
    for field in _JSON_PROFILE_FIELDS:
        raw = result.get(field)
        if isinstance(raw, str):
            try:
                result[field] = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                result[field] = []
        elif raw is None:
            result[field] = []
    return result


def get_profile(conn: sqlite3.Connection) -> dict:
    """
    Return the single profile row.
    Inserts a default row if none exists (singleton pattern via CHECK(id=1)).
    """
    row = conn.execute("SELECT * FROM profile WHERE id = 1").fetchone()
    if row is None:
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO profile (
                id, resume_text, target_roles, target_locations, remote_only,
                min_seniority, salary_min, salary_max, must_have_skills,
                nice_to_have_skills, blacklisted_companies, blacklisted_keywords,
                priority_categories, updated_at
            ) VALUES (1, NULL, '[]', '[]', 1, NULL, NULL, NULL, '[]', '[]', '[]', '[]', '[]', ?)
            """,
            (now,),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM profile WHERE id = 1").fetchone()
    return _deserialise_profile(dict(row))


def update_profile(conn: sqlite3.Connection, updates: dict) -> dict:
    """
    Partially update profile fields.
    List fields are serialised to JSON strings before storage.

    Returns the updated profile as a deserialised dict.
    """
    if not updates:
        return get_profile(conn)

    # Ensure profile row exists
    get_profile(conn)

    now = _now_iso()
    set_clauses = ["updated_at = :updated_at"]
    params: dict = {"updated_at": now}

    allowed = {
        "resume_text", "remote_only", "min_seniority",
        "salary_min", "salary_max",
    } | _JSON_PROFILE_FIELDS

    for field, value in updates.items():
        if field not in allowed or value is None:
            continue
        if field in _JSON_PROFILE_FIELDS:
            params[field] = _json_dumps(value)
        elif field == "remote_only":
            params[field] = 1 if value else 0
        else:
            params[field] = value
        set_clauses.append(f"{field} = :{field}")

    if len(set_clauses) == 1:
        # Only updated_at changed — still persist so updated_at is fresh
        pass

    conn.execute(
        f"UPDATE profile SET {', '.join(set_clauses)} WHERE id = 1",
        params,
    )
    conn.commit()
    return get_profile(conn)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

def get_analytics(conn: sqlite3.Connection) -> dict:
    """
    Compute:
      - Pipeline funnel counts by stage
      - Total discovered / applied
      - Response rate (phone_screen+ responses / applied)
      - Per-company breakdown
      - Weekly activity (new jobs + applications per ISO week)
    """
    # --- Funnel ---
    funnel_rows = conn.execute(
        "SELECT stage, COUNT(*) as count FROM pipeline GROUP BY stage"
    ).fetchall()
    funnel = [{"stage": r["stage"], "count": r["count"]} for r in funnel_rows]
    by_stage = {r["stage"]: r["count"] for r in funnel_rows}

    # --- Totals ---
    total_discovered: int = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE expired = 0 AND dismissed = 0"
    ).fetchone()[0]

    total_applied: int = by_stage.get("applied", 0) + by_stage.get("phone_screen", 0) + \
                         by_stage.get("technical", 0) + by_stage.get("final", 0) + \
                         by_stage.get("offer", 0) + by_stage.get("rejected", 0)

    # Responses = any stage past applied (phone_screen and beyond)
    responded = sum(
        by_stage.get(s, 0)
        for s in ("phone_screen", "technical", "final", "offer", "rejected")
    )
    response_rate = round(responded / total_applied, 4) if total_applied > 0 else 0.0

    # --- By company ---
    company_rows = conn.execute(
        """
        SELECT j.company,
               COUNT(DISTINCT j.id) AS discovered,
               COUNT(DISTINCT p.id) AS in_pipeline
        FROM jobs j
        LEFT JOIN pipeline p ON p.job_id = j.id
        WHERE j.expired = 0 AND j.dismissed = 0
        GROUP BY j.company
        ORDER BY discovered DESC
        LIMIT 50
        """
    ).fetchall()
    by_company = {}
    for r in company_rows:
        by_company[r["company"]] = {
            "discovered": r["discovered"],
            "in_pipeline": r["in_pipeline"],
        }

    # --- Weekly activity ---
    # SQLite strftime('%W', date) gives ISO week number (00-53)
    weekly_rows = conn.execute(
        """
        SELECT
            strftime('%Y-W%W', first_seen_at) AS week,
            COUNT(*) AS discovered
        FROM jobs
        GROUP BY week
        ORDER BY week DESC
        LIMIT 12
        """
    ).fetchall()
    applied_weekly_rows = conn.execute(
        """
        SELECT
            strftime('%Y-W%W', applied_at) AS week,
            COUNT(*) AS applied
        FROM pipeline
        WHERE applied_at IS NOT NULL
        GROUP BY week
        ORDER BY week DESC
        LIMIT 12
        """
    ).fetchall()
    applied_by_week = {r["week"]: r["applied"] for r in applied_weekly_rows}
    weekly_activity = [
        {
            "week": r["week"],
            "discovered": r["discovered"],
            "applied": applied_by_week.get(r["week"], 0),
        }
        for r in weekly_rows
    ]

    return {
        "funnel": funnel,
        "total_discovered": total_discovered,
        "total_applied": total_applied,
        "response_rate": response_rate,
        "by_company": by_company,
        "weekly_activity": weekly_activity,
    }


# ---------------------------------------------------------------------------
# Scrape runs
# ---------------------------------------------------------------------------

def create_scrape_run(conn: sqlite3.Connection) -> int:
    """
    Insert a new scrape run record with started_at = now.
    Returns the new run id.
    """
    now = _now_iso()
    cursor = conn.execute(
        "INSERT INTO scrape_runs (started_at, errors) VALUES (?, '[]')",
        (now,),
    )
    conn.commit()
    return cursor.lastrowid


def complete_scrape_run(conn: sqlite3.Connection, run_id: int, stats: dict) -> None:
    """
    Mark a scrape run as completed and record final statistics.

    Expected keys in stats:
        total_fetched, new_jobs, updated_jobs, expired_jobs, llm_scored, errors (list[str])
    """
    now = _now_iso()
    errors_json = _json_dumps(stats.get("errors", []))
    conn.execute(
        """
        UPDATE scrape_runs SET
            completed_at  = :completed_at,
            total_fetched = :total_fetched,
            new_jobs      = :new_jobs,
            updated_jobs  = :updated_jobs,
            expired_jobs  = :expired_jobs,
            llm_scored    = :llm_scored,
            errors        = :errors
        WHERE id = :run_id
        """,
        {
            "run_id": run_id,
            "completed_at": now,
            "total_fetched": stats.get("total_fetched", 0),
            "new_jobs": stats.get("new_jobs", 0),
            "updated_jobs": stats.get("updated_jobs", 0),
            "expired_jobs": stats.get("expired_jobs", 0),
            "llm_scored": stats.get("llm_scored", 0),
            "errors": errors_json,
        },
    )
    conn.commit()


def get_latest_scrape_run(conn: sqlite3.Connection) -> dict | None:
    """Return the most recently started scrape run, or None if the table is empty."""
    row = conn.execute(
        "SELECT * FROM scrape_runs ORDER BY started_at DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    result = dict(row)
    # Deserialise errors JSON
    raw_errors = result.get("errors", "[]")
    try:
        result["errors"] = json.loads(raw_errors) if isinstance(raw_errors, str) else raw_errors
    except (json.JSONDecodeError, TypeError):
        result["errors"] = []
    return result


# ---------------------------------------------------------------------------
# Company CRUD
# ---------------------------------------------------------------------------

def get_companies(conn, category=None, enabled_only=True):
    """Return all companies, optionally filtered."""
    conditions = []
    params = {}
    if enabled_only:
        conditions.append("enabled = 1")
    if category:
        conditions.append("category = :category")
        params["category"] = category
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = conn.execute(f"SELECT * FROM companies {where} ORDER BY category, name", params).fetchall()
    return _rows_to_list(rows)


def get_company(conn, company_id):
    row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
    return _row_to_dict(row)


def create_company(conn, data):
    now = _now_iso()
    cursor = conn.execute(
        """INSERT INTO companies (name, ats, slug, category, enabled, careers_url, workday_url, created_at, updated_at)
           VALUES (:name, :ats, :slug, :category, :enabled, :careers_url, :workday_url, :created_at, :updated_at)""",
        {
            "name": data["name"],
            "ats": data.get("ats", "greenhouse"),
            "slug": data["slug"],
            "category": data.get("category", "fintech"),
            "enabled": 1 if data.get("enabled", True) else 0,
            "careers_url": data.get("careers_url"),
            "workday_url": data.get("workday_url"),
            "created_at": now,
            "updated_at": now,
        }
    )
    conn.commit()
    return cursor.lastrowid


def update_company(conn, company_id, updates):
    now = _now_iso()
    allowed = {"name", "ats", "slug", "category", "enabled", "careers_url", "workday_url"}
    set_clauses = ["updated_at = :updated_at"]
    params = {"updated_at": now, "company_id": company_id}
    for field, value in updates.items():
        if field not in allowed:
            continue
        if field == "enabled":
            params[field] = 1 if value else 0
        else:
            params[field] = value
        set_clauses.append(f"{field} = :{field}")
    conn.execute(f"UPDATE companies SET {', '.join(set_clauses)} WHERE id = :company_id", params)
    conn.commit()
    return get_company(conn, company_id)


def delete_company(conn, company_id):
    cursor = conn.execute("DELETE FROM companies WHERE id = ?", (company_id,))
    conn.commit()
    return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# LLM Settings CRUD
# ---------------------------------------------------------------------------

_DEFAULT_LLM_SETTINGS = {
    "id": 1,
    "provider": "keyword_only",
    "api_key": None,
    "api_url": None,
    "model": None,
    "temperature": 0.1,
    "max_tokens": 500,
    "updated_at": None,
}


def get_llm_settings(conn):
    """Get LLM provider settings (singleton row)."""
    row = conn.execute("SELECT * FROM llm_settings WHERE id = 1").fetchone()
    if row is None:
        now = _now_iso()
        conn.execute(
            "INSERT INTO llm_settings (id, provider, temperature, max_tokens, updated_at) VALUES (1, 'keyword_only', 0.1, 500, ?)",
            (now,)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM llm_settings WHERE id = 1").fetchone()
    return dict(row)


def update_llm_settings(conn, updates):
    """Update LLM settings. Returns updated settings."""
    get_llm_settings(conn)  # ensure row exists
    now = _now_iso()
    allowed = {"provider", "api_key", "api_url", "model", "temperature", "max_tokens"}
    set_clauses = ["updated_at = :updated_at"]
    params = {"updated_at": now}
    for field, value in updates.items():
        if field not in allowed:
            continue
        params[field] = value
        set_clauses.append(f"{field} = :{field}")
    conn.execute(f"UPDATE llm_settings SET {', '.join(set_clauses)} WHERE id = 1", params)
    conn.commit()
    return get_llm_settings(conn)


def seed_companies_from_scraper(conn):
    """Import the hardcoded COMPANIES list from job_scraper.py into the DB if the table is empty."""
    count = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
    if count > 0:
        return 0  # already seeded

    import sys
    from pathlib import Path
    # Search multiple locations for job_scraper.py
    candidates = [
        Path(__file__).resolve().parent.parent / "scraper",                       # GX10 layout
        Path(__file__).resolve().parent.parent.parent / "infrastructure" / "scripts",  # MacBook layout
    ]
    for cand in candidates:
        if cand.exists() and str(cand) not in sys.path:
            sys.path.insert(0, str(cand))
    try:
        from job_scraper import COMPANIES
    except ImportError:
        return 0  # scraper not found, skip seeding

    now = _now_iso()
    inserted = 0
    for c in COMPANIES:
        try:
            conn.execute(
                """INSERT INTO companies (name, ats, slug, category, enabled, careers_url, workday_url, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)""",
                (c["name"], c["ats"], c["slug"], c.get("category", "other"),
                 c.get("careers_url"), c.get("workday_url"), now, now)
            )
            inserted += 1
        except Exception:
            pass  # skip duplicates
    conn.commit()
    return inserted
