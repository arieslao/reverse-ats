#!/usr/bin/env python3
"""Reverse ATS — FastAPI backend."""

import csv
import io
import json
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from db import (
    get_connection,
    init_db,
    get_jobs,
    get_job,
    dismiss_job,
    create_pipeline_entry,
    update_pipeline_entry,
    get_pipeline,
    get_pipeline_events,
    get_profile,
    update_profile,
    get_analytics,
    get_latest_scrape_run,
    get_companies,
    get_company,
    create_company,
    update_company,
    delete_company,
    get_llm_settings,
    update_llm_settings,
    backup_db,
    list_backups,
)
from models import (
    JobOut,
    JobListResponse,
    JobDismiss,
    PipelineCreate,
    PipelineUpdate,
    PipelineOut,
    PipelineEventOut,
    PipelineListResponse,
    ProfileUpdate,
    ProfileOut,
    AnalyticsOut,
    ScrapeRunOut,
    PipelineStage,
    CompanyCreate,
    CompanyUpdate,
    CompanyOut,
    LLMSettingsUpdate,
    LLMSettingsOut,
)

# Absolute path to pipeline.py so subprocess works regardless of cwd
PIPELINE_SCRIPT = Path(__file__).parent / "pipeline.py"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Reverse ATS", version="1.0.0", lifespan=lifespan)

# CORS — allow local dev and Cloudflare Pages
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://*.pages.dev"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _conn():
    """Return a new DB connection per request."""
    return get_connection()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "reverse-ats"}


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

@app.get("/api/jobs", response_model=JobListResponse)
def list_jobs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    remote_only: bool = Query(True),
    min_score: int = Query(0, ge=0, le=100),
    category: Optional[str] = Query(None),
    dismissed: bool = Query(False),
    expired: bool = Query(False),
    new_since: Optional[str] = Query(None, description="ISO date, e.g. 2026-04-15"),
    search: Optional[str] = Query(None, description="Search title/company"),
    sort_by: str = Query("score", description="Sort: score, newest, oldest, company, title"),
    exclude_companies: Optional[str] = Query(None, description="Comma-separated company names to exclude"),
):
    conn = _conn()
    try:
        exc_companies = (
            [c.strip() for c in exclude_companies.split(",") if c.strip()]
            if exclude_companies
            else None
        ) or None
        jobs_raw, total = get_jobs(
            conn,
            page=page,
            per_page=per_page,
            remote_only=remote_only,
            min_score=min_score,
            category=category,
            dismissed=dismissed,
            expired=expired,
            new_since=new_since,
            search=search,
            sort_by=sort_by,
            exclude_companies=exc_companies,
        )
        jobs = [JobOut.model_validate(j) for j in jobs_raw]
        return JobListResponse(jobs=jobs, total=total, page=page, per_page=per_page)
    finally:
        conn.close()


@app.get("/api/jobs/{job_id}", response_model=JobOut)
def get_job_detail(job_id: str):
    conn = _conn()
    try:
        job = get_job(conn, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        return JobOut.model_validate(job)
    finally:
        conn.close()


@app.post("/api/jobs/{job_id}/dismiss")
def dismiss_job_endpoint(job_id: str, body: Optional[JobDismiss] = None):
    dismissed_value = body.dismissed if body is not None else True
    conn = _conn()
    try:
        job = get_job(conn, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        success = dismiss_job(conn, job_id, dismissed=dismissed_value)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update dismiss status")
        return {"job_id": job_id, "dismissed": dismissed_value}
    finally:
        conn.close()


@app.post("/api/jobs/{job_id}/save", response_model=PipelineOut)
def save_job(job_id: str):
    """Move a job to the pipeline (stage=saved)."""
    conn = _conn()
    try:
        job = get_job(conn, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        pipeline_id = create_pipeline_entry(conn, job_id, stage="saved")
        if pipeline_id is None:
            raise HTTPException(status_code=500, detail="Failed to create pipeline entry")
        # Retrieve the freshly created pipeline entry from the pipeline list
        pipeline_items = get_pipeline(conn)
        entry = next((p for p in pipeline_items if p["id"] == pipeline_id), None)
        if entry is None:
            raise HTTPException(status_code=500, detail="Pipeline entry created but could not be retrieved")
        out = PipelineOut.model_validate(entry)
        if entry.get("job"):
            out.job = JobOut.model_validate(entry["job"])
        elif job:
            out.job = JobOut.model_validate(job)
        return out
    finally:
        conn.close()


@app.post("/api/jobs/{job_id}/cover-letter")
def generate_cover_letter_endpoint(job_id: str):
    """Generate a personalized cover letter for this job using the configured LLM."""
    conn = _conn()
    try:
        job = get_job(conn, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

        profile = get_profile(conn)
        settings = get_llm_settings(conn)

        from scorer import generate_cover_letter

        result = generate_cover_letter(
            title=job["title"],
            company=job["company"],
            location=job.get("location", ""),
            department=job.get("department", ""),
            description=job.get("description_snippet", "") or job.get("description_full", ""),
            resume_text=profile.get("resume_text"),
            target_roles=profile.get("target_roles") if isinstance(profile.get("target_roles"), list) else None,
            must_have_skills=profile.get("must_have_skills") if isinstance(profile.get("must_have_skills"), list) else None,
            nice_to_have_skills=profile.get("nice_to_have_skills") if isinstance(profile.get("nice_to_have_skills"), list) else None,
            settings=settings,
        )
        # Save cover letter to pipeline entry if one exists
        if not result.get("error") and result.get("cover_letter"):
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).isoformat()
            pipeline_row = conn.execute(
                "SELECT id FROM pipeline WHERE job_id = ?", (job_id,)
            ).fetchone()
            if pipeline_row:
                conn.execute(
                    "UPDATE pipeline SET cover_letter = ?, updated_at = ? WHERE id = ?",
                    (result["cover_letter"], now, pipeline_row["id"])
                )
                conn.commit()
        return result
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

@app.get("/api/pipeline", response_model=PipelineListResponse)
def list_pipeline():
    conn = _conn()
    try:
        raw_items = get_pipeline(conn)
        items = []
        for row in raw_items:
            entry = PipelineOut.model_validate(row)
            # Build job object from the flat joined columns
            if row.get("company") and row.get("title"):
                entry.job = JobOut(
                    id=row.get("job_id", ""),
                    company=row["company"],
                    title=row["title"],
                    location=row.get("location"),
                    url=row.get("url", ""),
                    remote=bool(row.get("remote", False)),
                    keyword_score=row.get("keyword_score", 0),
                    llm_score=row.get("llm_score"),
                    category=row.get("category"),
                    ats_type=row.get("ats_type"),
                    first_seen_at=row.get("first_seen_at", ""),
                    last_seen_at=row.get("last_seen_at", ""),
                    description_snippet=row.get("description_snippet"),
                )
            items.append(entry)

        # Group by stage
        by_stage: dict[str, list[PipelineOut]] = {}
        for item in items:
            stage_key = item.stage.value if isinstance(item.stage, PipelineStage) else str(item.stage)
            by_stage.setdefault(stage_key, []).append(item)

        return PipelineListResponse(items=items, by_stage=by_stage)
    finally:
        conn.close()


@app.get("/api/pipeline/export")
def export_pipeline(format: str = Query("csv", pattern="^(csv|json)$")):
    """
    Export every pipeline entry. Use this as a portable backup of your
    application history that lives outside SQLite.

    CSV columns are stable and human-readable; JSON includes all fields.
    """
    conn = _conn()
    try:
        rows = get_pipeline(conn)
    finally:
        conn.close()

    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    if format == "json":
        # Strip non-serializable types and return as a download
        payload = json.dumps(rows, indent=2, default=str)
        return StreamingResponse(
            io.BytesIO(payload.encode("utf-8")),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="reverse-ats-pipeline-{ts}.json"'},
        )

    # CSV
    cols = [
        "stage", "company", "title", "url", "location",
        "applied_at", "notes",
        "contact_name", "contact_email", "contact_role",
        "next_step", "next_step_date", "salary_offered",
        "created_at", "updated_at", "source_deleted", "job_id",
    ]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow({c: r.get(c, "") for c in cols})

    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="reverse-ats-pipeline-{ts}.csv"'},
    )


@app.post("/api/pipeline", response_model=PipelineOut)
def create_pipeline(body: PipelineCreate):
    conn = _conn()
    try:
        job = get_job(conn, body.job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job '{body.job_id}' not found")
        pipeline_id = create_pipeline_entry(
            conn,
            job_id=body.job_id,
            stage=body.stage.value,
            notes=body.notes,
        )
        if pipeline_id is None:
            raise HTTPException(status_code=500, detail="Failed to create pipeline entry")
        pipeline_items = get_pipeline(conn)
        entry = next((p for p in pipeline_items if p["id"] == pipeline_id), None)
        if entry is None:
            raise HTTPException(status_code=500, detail="Pipeline entry created but could not be retrieved")
        out = PipelineOut.model_validate(entry)
        if entry.get("job"):
            out.job = JobOut.model_validate(entry["job"])
        elif job:
            out.job = JobOut.model_validate(job)
        return out
    finally:
        conn.close()


@app.put("/api/pipeline/{pipeline_id}", response_model=PipelineOut)
def update_pipeline(pipeline_id: int, body: PipelineUpdate):
    conn = _conn()
    try:
        # Build updates dict from only the fields that were explicitly set
        updates = body.model_dump(exclude_none=True)
        # Coerce enum to its string value if present
        if "stage" in updates and isinstance(updates["stage"], PipelineStage):
            updates["stage"] = updates["stage"].value

        if not updates:
            raise HTTPException(status_code=422, detail="No update fields provided")

        success = update_pipeline_entry(conn, pipeline_id, updates)
        if not success:
            raise HTTPException(status_code=404, detail=f"Pipeline entry {pipeline_id} not found")

        pipeline_items = get_pipeline(conn)
        entry = next((p for p in pipeline_items if p["id"] == pipeline_id), None)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"Pipeline entry {pipeline_id} not found after update")

        out = PipelineOut.model_validate(entry)
        if entry.get("job"):
            out.job = JobOut.model_validate(entry["job"])
        return out
    finally:
        conn.close()


@app.get("/api/pipeline/{pipeline_id}/events", response_model=list[PipelineEventOut])
def pipeline_events(pipeline_id: int):
    conn = _conn()
    try:
        events_raw = get_pipeline_events(conn, pipeline_id)
        if events_raw is None:
            raise HTTPException(status_code=404, detail=f"Pipeline entry {pipeline_id} not found")
        return [PipelineEventOut.model_validate(e) for e in events_raw]
    finally:
        conn.close()


@app.delete("/api/pipeline/{pipeline_id}")
def delete_pipeline_entry(pipeline_id: int):
    """Remove a pipeline entry (archive/delete)."""
    conn = _conn()
    try:
        # Check it exists
        rows = get_pipeline(conn)
        entry = next((p for p in rows if p["id"] == pipeline_id), None)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"Pipeline entry {pipeline_id} not found")
        # Delete events first (foreign key), then the entry
        conn.execute("DELETE FROM pipeline_events WHERE pipeline_id = ?", (pipeline_id,))
        conn.execute("DELETE FROM pipeline WHERE id = ?", (pipeline_id,))
        conn.commit()
        return {"deleted": True, "id": pipeline_id}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

@app.get("/api/profile", response_model=ProfileOut)
def get_profile_endpoint():
    conn = _conn()
    try:
        profile = get_profile(conn)
        return ProfileOut.model_validate(profile)
    finally:
        conn.close()


@app.put("/api/profile", response_model=ProfileOut)
def update_profile_endpoint(body: ProfileUpdate):
    conn = _conn()
    try:
        updates = body.model_dump(exclude_none=True)
        updated = update_profile(conn, updates)
        return ProfileOut.model_validate(updated)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

@app.get("/api/analytics", response_model=AnalyticsOut)
def analytics():
    conn = _conn()
    try:
        data = get_analytics(conn)
        return AnalyticsOut.model_validate(data)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Scrape
# ---------------------------------------------------------------------------

@app.get("/api/scrape/status", response_model=Optional[ScrapeRunOut])
def scrape_status():
    conn = _conn()
    try:
        run = get_latest_scrape_run(conn)
        if run is None:
            return None
        return ScrapeRunOut.model_validate(run)
    finally:
        conn.close()


@app.post("/api/scrape/trigger")
def trigger_scrape():
    """Manually trigger a scrape run (runs pipeline.py as subprocess)."""
    if not PIPELINE_SCRIPT.exists():
        raise HTTPException(
            status_code=500,
            detail=f"pipeline.py not found at {PIPELINE_SCRIPT}",
        )
    subprocess.Popen(
        [sys.executable, str(PIPELINE_SCRIPT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        # Detach from parent process group so it survives if the request dies
        start_new_session=True,
    )
    return {"status": "started", "script": str(PIPELINE_SCRIPT)}


@app.get("/api/jobs/score-stats")
def job_score_stats():
    """
    Score coverage for active (non-dismissed, non-expired) jobs. Used by Admin UI
    to show how many jobs would be re-scored.
    """
    conn = _conn()
    try:
        row = conn.execute(
            """
            SELECT
              COUNT(*)                                       AS total,
              SUM(CASE WHEN llm_score IS NOT NULL THEN 1 ELSE 0 END) AS scored,
              SUM(CASE WHEN llm_score IS NULL     THEN 1 ELSE 0 END) AS unscored
            FROM jobs
            WHERE dismissed = 0 AND expired = 0
            """
        ).fetchone()
    finally:
        conn.close()
    return {
        "total": row["total"] or 0,
        "scored": row["scored"] or 0,
        "unscored": row["unscored"] or 0,
    }


@app.post("/api/jobs/rescore")
def trigger_rescore(all: bool = Query(False, description="If true, re-score every active job (clears llm_score first)")):
    """
    Score all unscored jobs in the background.

    By default this only scores jobs where llm_score IS NULL (cheap backfill —
    use this after first configuring an LLM provider).

    Pass ?all=true to clear every active llm_score and re-run scoring against
    the current resume + LLM settings (use after changing your resume or
    switching providers). Costs roughly 1 LLM call per active job.
    """
    if not PIPELINE_SCRIPT.exists():
        raise HTTPException(
            status_code=500,
            detail=f"pipeline.py not found at {PIPELINE_SCRIPT}",
        )

    cleared = 0
    backup_info: Optional[dict] = None
    if all:
        # Snapshot the DB before clobbering scores. If the user changes their
        # mind (or the new provider scores worse), they can restore by
        # copying the backup back over reverse_ats.db.
        backup_info = backup_db(reason="rescore-all")
        conn = _conn()
        try:
            cur = conn.execute(
                "UPDATE jobs SET llm_score = NULL, llm_reasoning = NULL WHERE dismissed = 0 AND expired = 0"
            )
            cleared = cur.rowcount
            conn.commit()
        finally:
            conn.close()

    subprocess.Popen(
        [sys.executable, str(PIPELINE_SCRIPT), "--score-only"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return {
        "status": "started",
        "mode": "all" if all else "unscored_only",
        "cleared": cleared,
        "backup": backup_info,
    }


# ---------------------------------------------------------------------------
# Admin — Backups
# ---------------------------------------------------------------------------

@app.get("/api/admin/backups")
def list_db_backups():
    """Return all DB backups (newest first)."""
    return list_backups()


@app.post("/api/admin/backups")
def create_db_backup(reason: str = Query("manual", description="Short label, e.g. 'pre-import' or 'manual'")):
    """Take an immediate backup of the SQLite DB."""
    info = backup_db(reason=reason)
    if info is None:
        raise HTTPException(status_code=500, detail="DB file does not exist")
    return info


# ---------------------------------------------------------------------------
# Admin — Companies
# ---------------------------------------------------------------------------

@app.get("/api/admin/companies", response_model=list[CompanyOut])
def list_companies(category: Optional[str] = Query(None), enabled_only: bool = Query(False)):
    conn = _conn()
    try:
        companies = get_companies(conn, category=category, enabled_only=enabled_only)
        return [CompanyOut.model_validate(c) for c in companies]
    finally:
        conn.close()

@app.get("/api/admin/companies/{company_id}", response_model=CompanyOut)
def get_company_detail(company_id: int):
    conn = _conn()
    try:
        company = get_company(conn, company_id)
        if company is None:
            raise HTTPException(status_code=404, detail=f"Company {company_id} not found")
        return CompanyOut.model_validate(company)
    finally:
        conn.close()

@app.post("/api/admin/companies", response_model=CompanyOut)
def create_company_endpoint(body: CompanyCreate):
    conn = _conn()
    try:
        company_id = create_company(conn, body.model_dump())
        company = get_company(conn, company_id)
        return CompanyOut.model_validate(company)
    finally:
        conn.close()

@app.put("/api/admin/companies/{company_id}", response_model=CompanyOut)
def update_company_endpoint(company_id: int, body: CompanyUpdate):
    conn = _conn()
    try:
        company = get_company(conn, company_id)
        if company is None:
            raise HTTPException(status_code=404, detail=f"Company {company_id} not found")
        updates = body.model_dump(exclude_none=True)
        updated = update_company(conn, company_id, updates)
        return CompanyOut.model_validate(updated)
    finally:
        conn.close()

@app.delete("/api/admin/companies/{company_id}")
def delete_company_endpoint(company_id: int):
    conn = _conn()
    try:
        success = delete_company(conn, company_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Company {company_id} not found")
        return {"deleted": True, "id": company_id}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Feed — Industries (dropdown source)
# ---------------------------------------------------------------------------

# Friendly labels for legacy category IDs that pre-date the industry-pack system.
# Pack IDs get their labels from industry_packs.PACKS automatically.
_LEGACY_CATEGORY_LABELS = {
    "fintech": "Fintech",
    "big_tech": "Big Tech",
    "ai_tech": "AI & Tech",
    "healthtech": "HealthTech",
    "quant": "Quant / Trading",
}


@app.get("/api/feed/industries")
def list_feed_industries():
    """
    Return the union of:
      - all industry packs (so users see the full taxonomy even if empty)
      - any legacy/ad-hoc categories present in the jobs table that aren't packs

    Each entry has a friendly label + current job count. Used to populate the
    Feed's Industry dropdown.
    """
    from industry_packs import PACKS

    conn = _conn()
    try:
        rows = conn.execute(
            """
            SELECT category, COUNT(*) AS n
            FROM jobs
            WHERE dismissed = 0 AND expired = 0 AND category IS NOT NULL AND category != ''
            GROUP BY category
            """
        ).fetchall()
    finally:
        conn.close()

    counts: dict[str, int] = {row["category"]: row["n"] for row in rows}

    industries: list[dict] = []
    seen: set[str] = set()

    # 1. All industry packs, in declaration order (canonical taxonomy)
    for pack_id, pack in PACKS.items():
        industries.append(
            {"id": pack_id, "label": pack["name"], "count": counts.get(pack_id, 0)}
        )
        seen.add(pack_id)

    # 2. Legacy / ad-hoc categories from the DB that aren't packs
    for cat_id, n in counts.items():
        if cat_id in seen:
            continue
        label = _LEGACY_CATEGORY_LABELS.get(cat_id) or cat_id.replace("_", " ").title()
        industries.append({"id": cat_id, "label": label, "count": n})

    # Sort: non-empty first (by count desc), then empty packs alphabetically by label
    industries.sort(key=lambda i: (0 if i["count"] > 0 else 1, -i["count"], i["label"]))
    return industries


# ---------------------------------------------------------------------------
# Admin — Industry Packs
# ---------------------------------------------------------------------------

@app.get("/api/admin/industry-packs")
def list_industry_packs():
    """List available industry packs with metadata."""
    from industry_packs import get_available_packs
    return get_available_packs()

@app.post("/api/admin/industry-packs/{pack_id}/install")
def install_industry_pack(pack_id: str):
    """Install all companies from an industry pack."""
    from industry_packs import get_pack_companies
    companies = get_pack_companies(pack_id)
    if not companies:
        raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")

    conn = _conn()
    try:
        installed = 0
        skipped = 0
        for company in companies:
            try:
                create_company(conn, company)
                installed += 1
            except Exception:
                skipped += 1  # already exists (unique constraint)
        return {"pack_id": pack_id, "installed": installed, "skipped": skipped, "total": len(companies)}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Admin — LLM Settings
# ---------------------------------------------------------------------------

@app.get("/api/admin/llm-settings", response_model=LLMSettingsOut)
def get_llm_settings_endpoint():
    conn = _conn()
    try:
        settings = get_llm_settings(conn)
        # Mask the API key for security (show first 8 chars + asterisks)
        if settings.get("api_key"):
            key = settings["api_key"]
            settings["api_key"] = key[:8] + "*" * (len(key) - 8) if len(key) > 8 else "***"
        return LLMSettingsOut.model_validate(settings)
    finally:
        conn.close()

@app.put("/api/admin/llm-settings", response_model=LLMSettingsOut)
def update_llm_settings_endpoint(body: LLMSettingsUpdate):
    conn = _conn()
    try:
        updates = body.model_dump(exclude_none=True)
        updated = update_llm_settings(conn, updates)
        # Mask key in response
        if updated.get("api_key"):
            key = updated["api_key"]
            updated["api_key"] = key[:8] + "*" * (len(key) - 8) if len(key) > 8 else "***"
        return LLMSettingsOut.model_validate(updated)
    finally:
        conn.close()

@app.post("/api/admin/llm-settings/test")
def test_llm_settings():
    """Test the current LLM configuration by scoring a sample job."""
    conn = _conn()
    try:
        settings = get_llm_settings(conn)
        from scorer import check_inference_health, score_job

        health = check_inference_health(settings)

        # Try scoring a sample job
        result = score_job(
            title="Senior AI Engineer",
            company="Test Company",
            location="Remote, US",
            department="Engineering",
            description="Looking for a senior engineer to build AI/ML infrastructure.",
            settings=settings,
        )
        return {
            "health": health,
            "test_score": result,
            "provider": settings.get("provider", "keyword_only"),
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8091)
