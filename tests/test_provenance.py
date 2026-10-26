"""Keep source-verification claims honest when data or upstream responses change."""

from copy import deepcopy
import json

import pytest

from backend.domain import ROOT, load_dataset
from backend.provenance import read_verification, verification_summary
from scripts.verify_upstream import compare, index_rows, request_urls


def wind_row(**changes):
    return {
        "dataset": "WINDFOR", "startTime": "2026-01-02T00:00:00Z",
        "publishTime": "2026-01-01T07:30:00Z", "generation": 100,
        **changes,
    }


def test_verifier_detects_changed_missing_and_new_records():
    original = [wind_row(), wind_row(startTime="2026-01-02T01:00:00Z")]
    fresh = [wind_row(generation=101), wind_row(startTime="2026-01-02T02:00:00Z")]
    result = compare(index_rows(original, "WINDFOR", filter_cohort=False), index_rows(fresh, "WINDFOR", filter_cohort=True))
    assert result["matched_records"] == 0
    assert result["changed_records"] == 1
    assert result["missing_upstream_records"] == 1
    assert result["new_upstream_records"] == 1


def test_verifier_normalizes_timezones_but_compares_all_source_fields():
    original = index_rows([wind_row()], "WINDFOR", filter_cohort=False)
    same = index_rows([wind_row(startTime="2026-01-02T01:00:00+01:00")], "WINDFOR", filter_cohort=True)
    assert compare(original, same)["matched_records"] == 1
    changed = index_rows([wind_row(generation=100, additionalSourceField="new")], "WINDFOR", filter_cohort=True)
    assert compare(original, changed)["changed_records"] == 1


@pytest.mark.parametrize("changes", [
    {"startTime": "2026-01-01T23:00:00Z"},
    {"startTime": "2026-02-02T00:00:00Z"},
    {"publishTime": "2026-02-01T00:00:00Z"},
])
def test_verifier_rejects_bundled_out_of_scope_records(changes):
    with pytest.raises(ValueError, match="outside"):
        index_rows([wind_row(**changes)], "WINDFOR", filter_cohort=False)
    assert index_rows([wind_row(**changes)], "WINDFOR", filter_cohort=True) == {}


def test_verifier_rejects_conflicts_wrong_dataset_and_naive_time():
    with pytest.raises(ValueError, match="Conflicting duplicate"):
        index_rows([wind_row(), wind_row(generation=999)], "WINDFOR", filter_cohort=True)
    with pytest.raises(ValueError, match="Unexpected dataset"):
        index_rows([wind_row(dataset="OTHER")], "WINDFOR", filter_cohort=True)
    with pytest.raises(ValueError, match="timezone"):
        index_rows([wind_row(startTime="2026-01-02T00:00:00")], "WINDFOR", filter_cohort=True)


def test_verifier_rejects_bundled_non_wind_actuals():
    record = wind_row(dataset="FUELHH", fuelType="GAS")
    with pytest.raises(ValueError, match="non-WIND"):
        index_rows([record], "FUELHH", filter_cohort=False)
    assert index_rows([record], "FUELHH", filter_cohort=True) == {}


def test_verifier_only_requests_two_official_dataset_endpoints():
    requests = request_urls()
    assert len(requests) == 64
    assert {dataset for dataset, _ in requests} == {"WINDFOR", "FUELHH"}
    assert all(url.startswith(f"https://data.elexon.co.uk/bmrs/api/v1/datasets/{dataset}/stream?") for dataset, url in requests)
    assert all("fuelType=WIND" in url for dataset, url in requests if dataset == "FUELHH")


def test_completed_report_matches_current_snapshot():
    summary = read_verification(load_dataset().manifest["files"])
    assert summary["status"] == "match"
    assert summary["matched_records"] == 19352
    assert summary["requests_checked"] == 64
    assert summary["checked_at"]


def test_old_or_incomplete_report_cannot_claim_current_verification():
    files = load_dataset().manifest["files"]
    report = json.loads((ROOT / "data/upstream-verification.json").read_text())
    changed_files = deepcopy(files)
    changed_files["forecasts.json.gz"]["sha256"] = "different"
    assert verification_summary(report, changed_files)["status"] == "outdated"
    incomplete = deepcopy(report)
    incomplete["datasets"]["WINDFOR"]["matched_records"] -= 1
    assert verification_summary(incomplete, files)["status"] == "not_verified"
    incomplete["status"] = "unavailable"
    assert verification_summary(incomplete, files)["status"] == "unavailable"


def test_missing_or_corrupt_report_does_not_break_the_app(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.provenance.ROOT", tmp_path)
    assert read_verification({})["status"] == "not_verified"
    (tmp_path / "data").mkdir()
    (tmp_path / "data/upstream-verification.json").write_text("invalid json")
    assert read_verification({})["status"] == "not_verified"
