import csv
import io

from fastapi.testclient import TestClient
import pytest

from backend.app import app

client = TestClient(app)


def test_health_and_request_observability():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["X-Request-ID"]
    assert response.headers["X-Content-Type-Options"] == "nosniff"


@pytest.mark.parametrize("path", ["/api/v1/overview?cutoff=24:00", "/api/v1/day?decision_date=2026-02-01", "/api/v1/day?decision_date=invalid", "/api/v1/publications?decision_date=2025-12-31", "/api/v1/export.csv?cutoff=abc"])
def test_invalid_parameters_return_actionable_client_errors(path):
    response = client.get(path)
    assert response.status_code == 422
    assert "detail" in response.json()
    assert response.headers["cache-control"] == "no-store"


def test_day_and_overview_share_the_same_selection():
    day = client.get("/api/v1/day?decision_date=2026-01-15&cutoff=09:00").json()
    month = client.get("/api/v1/overview?cutoff=09:00").json()
    assert day["metrics"] == month["days"][14]["metrics"]
    assert day["hours"][0]["forecast_mw"] == 7398
    assert day["hours"][0]["publish_time"] == "2026-01-15T07:30:00Z"


def test_csv_is_complete_and_auditable():
    response = client.get("/api/v1/export.csv?cutoff=09:00")
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == 744
    assert rows[-1]["delivery_date"] == "2026-02-01"
    assert "publish_time" in rows[0]
    assert response.headers["content-disposition"].startswith("attachment;")
    one_day = client.get("/api/v1/export.csv?decision_date=2026-01-15&cutoff=09:00")
    assert len(list(csv.DictReader(io.StringIO(one_day.text)))) == 24


def test_provenance_and_api_documentation_available():
    provenance = client.get("/api/v1/provenance").json()
    assert provenance["forecast_resolution_minutes"] == 60
    assert provenance["actual_resolution_minutes"] == 30
    assert len(provenance["requests"]) == 64
    assert provenance["actuals_are_retrospective"]
    assert provenance["upstream_verification"]["status"] == "match"
    assert provenance["upstream_verification"]["matched_records"] == 19352
    assert client.get("/api/openapi.json").status_code == 200


def test_snapshot_failure_is_a_503_not_fake_data(monkeypatch):
    def broken():
        raise ValueError("bad checksum")
    monkeypatch.setattr("backend.app.load_dataset", broken)
    response = client.get("/api/health")
    assert response.status_code == 503
    assert "snapshot" in response.json()["detail"].lower()
