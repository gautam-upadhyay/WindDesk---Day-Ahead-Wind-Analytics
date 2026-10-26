"""Unauthenticated checks for a local or deployed WindDesk instance (stdlib only)."""

import argparse
import csv
import io
import json
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def main(base_url: str) -> None:
    parsed = urlparse(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError("Use a base HTTP(S) URL without query or fragment")
    base_url = base_url.rstrip("/")

    def fetch(path: str) -> tuple[str, str]:
        with urlopen(Request(base_url + path, headers={"User-Agent": "WindDesk-Smoke/1.0"}), timeout=30) as response:
            if urlparse(response.url).netloc != parsed.netloc:
                raise ValueError(f"Unexpected redirect; public access may require login: {response.url}")
            return response.read().decode("utf-8"), response.headers.get("Content-Type", "")

    html, content_type = fetch("/")
    assert "text/html" in content_type and "WindDesk" in html, "Frontend HTML unavailable"
    for font in ("dm-sans-latin.woff2", "manrope-latin.woff2"):
        with urlopen(base_url + "/fonts/" + font, timeout=30) as response:
            assert response.read(4) == b"wOF2", f"Bundled font unavailable: {font}"
    health, _ = fetch("/api/health")
    assert json.loads(health)["status"] == "ok", "Snapshot readiness failed"
    body, _ = fetch("/api/v1/day?decision_date=2026-01-31&cutoff=09:00")
    day = json.loads(body)
    assert day["delivery_date"] == "2026-02-01" and len(day["hours"]) == 24, "Delivery boundary incorrect"
    body, _ = fetch("/api/v1/overview?cutoff=09:00")
    assert json.loads(body)["metrics"]["paired_hours"] == 744, "Month coverage incorrect"
    body, content_type = fetch("/api/v1/export.csv?decision_date=2026-01-15&cutoff=09:00")
    assert "text/csv" in content_type and len(list(csv.DictReader(io.StringIO(body)))) == 24, "CSV unavailable"
    body, _ = fetch("/api/openapi.json")
    assert "/api/v1/day" in json.loads(body)["paths"], "OpenAPI unavailable"
    body, _ = fetch("/api/v1/provenance")
    verification = json.loads(body)["upstream_verification"]
    assert verification["status"] == "match" and verification["matched_records"] == 19352, "Current source verification evidence missing"
    print(f"PASS: frontend, health, February delivery boundary, 744-hour coverage, CSV, API schema and source verification at {base_url}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    main(parser.parse_args().base_url)
