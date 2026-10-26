from __future__ import annotations

import csv
from datetime import date
import io
import json
import logging
from pathlib import Path
import time
import uuid

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from backend.domain import FIRST, LAST, load_dataset
from backend.schemas import Day, Overview, Publications
from backend.provenance import read_verification
from backend.auth import router as auth_router

logger = logging.getLogger("winddesk")
logging.basicConfig(level=logging.INFO, format="%(message)s")
app = FastAPI(title="WindDesk API", version="1.0.0", description="Point-in-time GB wind forecast replay for January 2026 purchase decisions.", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
app.include_router(auth_router)


@app.middleware("http")
async def observability(request: Request, call_next):
    request_id = uuid.uuid4().hex
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("request_failed request_id=%s", request_id)
        detail = "The account service is temporarily unavailable. Please try again later." if request.url.path.startswith("/api/auth/") else "Unable to read the verified data snapshot. Check server logs and run ingestion."
        response = JSONResponse({"detail": detail, "request_id": request_id}, status_code=503)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "public, max-age=3600" if response.status_code == 200 and request.url.path.startswith("/api/v1/") else "no-store"
    if request.url.path.startswith("/api/auth/"):
        response.headers["Cache-Control"] = "no-store, private"
        response.headers["Vary"] = "Cookie"
    logger.info(json.dumps({"request_id": request_id, "path": request.url.path, "status": response.status_code, "duration_ms": round((time.perf_counter() - started) * 1000, 2)}))
    return response


@app.exception_handler(ValueError)
def invalid_input(request: Request, exc: ValueError):
    return JSONResponse({"detail": str(exc)}, status_code=422)


@app.exception_handler(RequestValidationError)
def invalid_request(request: Request, exc: RequestValidationError):
    # Validation errors must never echo a password or credential input.
    errors = [{"loc": error["loc"], "msg": error["msg"], "type": error["type"]} for error in exc.errors()]
    return JSONResponse({"detail": errors}, status_code=422)


def dataset():
    try:
        return load_dataset()
    except (OSError, ValueError, KeyError) as exc:
        logger.error("snapshot_unavailable: %s", exc)
        raise HTTPException(503, "Verified data snapshot unavailable. Run python scripts/ingest.py.") from exc


@app.get("/api/health")
def health():
    data = dataset()
    return {"status": "ok", "snapshot_retrieved_at": data.manifest.get("retrieved_at"), "forecast_targets": len(data.forecasts), "actual_half_hours": len(data.actuals)}


@app.get("/api/v1/overview", response_model=Overview)
def overview(cutoff: str = Query("09:00", max_length=5)):
    return dataset().month(cutoff)


@app.get("/api/v1/day", response_model=Day)
def day(decision_date: date = FIRST, cutoff: str = Query("09:00", max_length=5)):
    return dataset().day(decision_date, cutoff)


@app.get("/api/v1/publications", response_model=Publications)
def publications(decision_date: date = FIRST, cutoff: str = Query("09:00", max_length=5)):
    return {"decision_date": str(decision_date), "cutoff": cutoff, "publications": dataset().publications(decision_date, cutoff)}


@app.get("/api/v1/provenance")
def provenance():
    data = dataset()
    return {**data.manifest, "upstream_verification": read_verification(data.manifest["files"]), "time_zone": "Europe/London", "forecast_resolution_minutes": 60, "actual_resolution_minutes": 30, "analysis_resolution_minutes": 60,
            "selection": "For each delivery hour, select the maximum publishTime strictly earlier than the decision cutoff on the preceding date.",
            "actuals": "Mean of both FUELHH WIND half-hours; latest downloaded publication per half-hour. Missing halves produce a missing hour.",
            "scope": "Great Britain metered wind represented by Elexon; not all UK renewable generation. No demand, price, portfolio or other generation data.",
            "decision_start": str(FIRST), "decision_end": str(LAST), "actuals_are_retrospective": True}


@app.get("/api/v1/export.csv")
def export(cutoff: str = Query("09:00", max_length=5), decision_date: date | None = None):
    data = dataset()
    days = [data.day(decision_date, cutoff)] if decision_date else data.month(cutoff)["days"]
    output = io.StringIO(newline="")
    fields = ["decision_date", "delivery_date", "cutoff_london", "start_time", "forecast_mw", "actual_mw", "error_mw", "publish_time", "actual_publish_time", "actual_half_hours", "forecast_age_hours", "lead_hours", "stale"]
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for selected in days:
        for row in selected["hours"]:
            writer.writerow({"decision_date": selected["decision_date"], "delivery_date": selected["delivery_date"], "cutoff_london": cutoff, **row})
    label = str(decision_date) if decision_date else "2026-01"
    return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="winddesk-{label}-{cutoff.replace(":", "")}.csv"'})


# In Docker / a production build the API serves the compiled React application.
# Vite proxies /api during development; no permissive CORS policy is needed.
dist = Path(__file__).resolve().parents[1] / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
