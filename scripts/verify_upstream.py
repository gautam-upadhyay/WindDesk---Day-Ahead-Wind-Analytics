"""Compare the entire bundled January cohort with fresh official Elexon responses.

This is an explicit online audit, separate from ingestion and from offline tests.
It never rewrites generation data. A changed upstream record produces a failed
comparison so an operator can investigate/re-ingest before changing the analysis.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import gzip
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
UTC = timezone.utc
START = datetime(2026, 1, 2, tzinfo=UTC)
END = datetime(2026, 2, 2, tzinfo=UTC)
LAST_PUBLICATION = datetime(2026, 2, 1, tzinfo=UTC)
FILES = {"WINDFOR": "forecasts.json.gz", "FUELHH": "actuals.json.gz"}


def timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Source timestamps must include a timezone")
    return parsed.astimezone(UTC)


def request_urls() -> list[tuple[str, str]]:
    requests = []
    for i in range(33):
        day = date(2025, 12, 30) + timedelta(days=i)
        params = {
            "publishDateTimeFrom": f"{day}T00:00:00Z",
            "publishDateTimeTo": f"{day + timedelta(days=1)}T00:00:00Z",
        }
        requests.append(("WINDFOR", f"{BASE}/WINDFOR/stream?{urlencode(params)}"))
    for i in range(31):
        day = date(2026, 1, 2) + timedelta(days=i)
        params = {"settlementDateFrom": str(day), "settlementDateTo": str(day), "fuelType": "WIND"}
        requests.append(("FUELHH", f"{BASE}/FUELHH/stream?{urlencode(params)}"))
    return requests


def fetch(item: tuple[str, str]) -> tuple[str, list[dict], dict]:
    dataset, url = item
    for attempt in range(4):
        try:
            request = Request(url, headers={"Accept": "application/json", "User-Agent": "WindDesk-source-verification/1.0"})
            with urlopen(request, timeout=45) as response:
                if not response.url.startswith(BASE + "/" + dataset + "/stream?"):
                    raise ValueError("Unexpected upstream redirect")
                body = response.read()
            rows = json.loads(body)
            if not isinstance(rows, list) or not rows:
                raise ValueError(f"Expected a non-empty record array for {dataset}")
            return dataset, rows, {"url": url, "response_rows": len(rows), "response_sha256": hashlib.sha256(body).hexdigest()}
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("Unreachable")


def index_rows(rows: list[dict], dataset: str, *, filter_cohort: bool) -> dict:
    result = {}
    for row in rows:
        if row.get("dataset") != dataset:
            raise ValueError(f"Unexpected dataset in {dataset} response")
        if dataset == "FUELHH" and row.get("fuelType") != "WIND":
            if filter_cohort:
                continue
            raise ValueError("Bundled actuals contain a non-WIND fuel")
        start, published = timestamp(row["startTime"]), timestamp(row["publishTime"])
        in_scope = START <= start < END and (dataset != "WINDFOR" or published < LAST_PUBLICATION)
        if not in_scope:
            if filter_cohort:
                continue
            raise ValueError("Bundled record is outside the January decision cohort")
        normalized = {**row, "startTime": start.isoformat(), "publishTime": published.isoformat()}
        key = (normalized["startTime"], normalized["publishTime"])
        if key in result and result[key] != normalized:
            raise ValueError(f"Conflicting duplicate in {dataset}: {key}")
        result[key] = normalized
    return result


def compare(local: dict, upstream: dict) -> dict:
    missing = sorted(local.keys() - upstream.keys())
    added = sorted(upstream.keys() - local.keys())
    changed = sorted(key for key in local.keys() & upstream.keys() if local[key] != upstream[key])
    return {
        "bundled_records": len(local),
        "upstream_records": len(upstream),
        "matched_records": sum(local[key] == upstream[key] for key in local.keys() & upstream.keys()),
        "missing_upstream_records": len(missing),
        "new_upstream_records": len(added),
        "changed_records": len(changed),
        "difference_examples": [
            {"startTime": key[0], "publishTime": key[1], "bundled": local.get(key), "upstream": upstream.get(key)}
            for key in (missing + added + changed)[:5]
        ],
        "target_minutes": sorted({timestamp(row["startTime"]).minute for row in upstream.values()}),
    }


def verify(data_dir: Path) -> dict:
    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    local, snapshot_files = {}, {}
    for dataset, filename in FILES.items():
        body = (data_dir / filename).read_bytes()
        digest = hashlib.sha256(body).hexdigest()
        if digest != manifest["files"][filename]["sha256"]:
            raise ValueError(f"Bundled integrity check failed: {filename}")
        rows = json.loads(gzip.decompress(body))
        if len(rows) != manifest["files"][filename]["rows"]:
            raise ValueError(f"Bundled row count failed: {filename}")
        snapshot_files[filename] = digest
        local[dataset] = index_rows(rows, dataset, filter_cohort=False)
    raw = {dataset: [] for dataset in FILES}
    sources = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for dataset, rows, evidence in pool.map(fetch, request_urls()):
            raw[dataset].extend(rows)
            sources.append(evidence)
            print(f"Verified response {len(sources)}/64: {dataset} ({len(rows)} rows)", flush=True)
    comparisons = {dataset: compare(local[dataset], index_rows(raw[dataset], dataset, filter_cohort=True)) for dataset in FILES}
    identical = all(result["matched_records"] == result["bundled_records"] == result["upstream_records"] for result in comparisons.values())
    return {
        "schema_version": 1,
        "status": "match" if identical else "differences",
        "checked_at": datetime.now(UTC).isoformat(),
        "method": "Independent full-record comparison with fresh HTTPS responses from the two official Elexon stream endpoints. All original fields are compared; timestamp formats are normalized to UTC. No generation records are modified.",
        "snapshot_files": snapshot_files,
        "requests_checked": len(sources),
        "datasets": comparisons,
        "sources": sources,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--output", type=Path, default=ROOT / "data/upstream-verification.json")
    args = parser.parse_args()
    try:
        report = verify(args.data_dir)
    except Exception as exc:
        report = {"schema_version": 1, "status": "unavailable", "checked_at": datetime.now(UTC).isoformat(), "reason": str(exc)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(json.dumps({key: value for key, value in report.items() if key != "sources"}, indent=2))
    raise SystemExit(0 if report["status"] == "match" else 1)
