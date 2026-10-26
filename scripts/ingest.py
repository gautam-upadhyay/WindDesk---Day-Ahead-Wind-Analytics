"""Fetch an auditable Elexon snapshot. Uses only the Python standard library."""

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


def fetch(dataset: str, day: date) -> tuple[list[dict], dict]:
    if dataset == "WINDFOR":
        params = {
            "publishDateTimeFrom": f"{day}T00:00:00Z",
            "publishDateTimeTo": f"{day + timedelta(days=1)}T00:00:00Z",
        }
    else:
        params = {"settlementDateFrom": str(day), "settlementDateTo": str(day), "fuelType": "WIND"}
    url = f"{BASE}/{dataset}/stream?{urlencode(params)}"
    for attempt in range(4):
        try:
            req = Request(url, headers={"Accept": "application/json", "User-Agent": "WindDesk-assignment/1.0"})
            with urlopen(req, timeout=45) as response:
                body = response.read()
            rows = json.loads(body)
            if not isinstance(rows, list) or not rows:
                raise ValueError(f"Empty or invalid upstream response: {url}")
            return rows, {"url": url, "rows": len(rows), "response_sha256": hashlib.sha256(body).hexdigest()}
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("Unreachable")


def ingest(output: Path) -> None:
    # Includes older vintages that might still be the latest available on Jan 1.
    tasks = [("WINDFOR", date(2025, 12, 30) + timedelta(days=i)) for i in range(33)]
    tasks += [("FUELHH", date(2026, 1, 2) + timedelta(days=i)) for i in range(31)]
    forecasts: dict[tuple, dict] = {}
    actuals: dict[tuple, dict] = {}
    requests = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for (dataset, day), (rows, provenance) in zip(tasks, pool.map(lambda task: fetch(*task), tasks)):
            print(f"{dataset} {day}: {len(rows)} rows", flush=True)
            requests.append(provenance)
            for row in rows:
                start = row.get("startTime", "")
                if not "2026-01-02T00:00:00Z" <= start < "2026-02-02T00:00:00Z":
                    continue
                if dataset == "WINDFOR":
                    if row["publishTime"] >= "2026-02-01T00:00:00Z":
                        continue
                    key = (start, row["publishTime"])
                    target = forecasts
                else:
                    if row.get("fuelType") != "WIND":
                        continue
                    key = (start, row["publishTime"])
                    target = actuals
                if key in target and target[key]["generation"] != row["generation"]:
                    raise ValueError(f"Conflicting duplicate: {dataset} {key}")
                target[key] = row

    output.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, rows in (("forecasts", forecasts), ("actuals", actuals)):
        payload = json.dumps(sorted(rows.values(), key=lambda row: (row["startTime"], row["publishTime"])), separators=(",", ":")).encode()
        # Stable gzip header makes identical source records reproducible.
        encoded = gzip.compress(payload, mtime=0)
        destination = output / f"{name}.json.gz"
        destination.with_suffix(".tmp").write_bytes(encoded)
        destination.with_suffix(".tmp").replace(destination)
        files[destination.name] = {"rows": len(rows), "sha256": hashlib.sha256(encoded).hexdigest(), "bytes": len(encoded)}
    manifest = {
        "schema_version": 1,
        "source": "Elexon Insights Solution",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "decision_dates": ["2026-01-01", "2026-01-31"],
        "delivery_dates": ["2026-01-02", "2026-02-01"],
        "files": files,
        "requests": requests,
        "attribution": "Contains BSC information licensed under the Elexon Public Data Licence.",
        "licence": "https://www.elexon.co.uk/bsc/documents/data/open-data-requests/bsc-public-data-licence/",
    }
    path = output / "manifest.json"
    path.with_suffix(".tmp").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    path.with_suffix(".tmp").replace(path)
    print(json.dumps(files, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data")
    args = parser.parse_args()
    ingest(args.output)
