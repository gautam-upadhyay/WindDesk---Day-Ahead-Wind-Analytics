from datetime import date, datetime, timedelta, timezone
import gzip
import json
import math

import pytest

from backend.domain import Dataset, FIRST, ROOT, decision_time, load_dataset, metrics, parse_timestamp, quantile


def forecast(start="2026-01-02T00:00:00Z", published="2026-01-01T08:00:00Z", value=100):
    return {"startTime": start, "publishTime": published, "generation": value}


def actual(start="2026-01-02T00:00:00Z", published="2026-01-02T00:30:00Z", value=90, fuel="WIND"):
    return {**forecast(start, published, value), "fuelType": fuel}


def test_selection_is_exclusive_and_latest_per_target():
    data = Dataset([
        forecast(published="2026-01-01T07:00:00Z", value=70),
        forecast(value=80),
        forecast(published="2026-01-01T09:00:00Z", value=900),
        forecast(published="2026-01-01T10:00:00Z", value=1000),
        forecast(start="2026-01-02T01:00:00Z", published="2026-01-01T06:00:00Z", value=60),
    ], [])
    rows = data.day_rows(FIRST, "09:00")
    assert rows[0]["forecast_mw"] == 80
    assert rows[1]["forecast_mw"] == 60
    assert rows[2]["forecast_mw"] is None
    assert rows[0]["publish_time"] == "2026-01-01T08:00:00Z"


def test_actuals_require_two_halves_and_use_latest_revision():
    data = Dataset([forecast()], [actual(value=10), actual(published="2026-01-02T03:00:00Z", value=100), actual(start="2026-01-02T00:30:00Z", value=200), actual(start="2026-01-02T01:00:00Z", value=900), actual(fuel="GAS", value=10000)])
    rows = data.day_rows(FIRST, "09:00")
    assert rows[0]["actual_mw"] == 150
    assert rows[0]["error_mw"] == -50
    assert rows[0]["actual_half_hours"] == 2
    assert rows[1]["actual_mw"] is None
    assert rows[1]["actual_half_hours"] == 1


def test_zero_is_a_real_observation_and_missing_is_not_zero():
    rows = Dataset([forecast(value=0)], [actual(value=0), actual(start="2026-01-02T00:30:00Z", value=0)]).day_rows(FIRST, "09:00")
    summary = metrics(rows)
    assert summary["paired_hours"] == 1
    assert summary["mae_mw"] == 0
    assert summary["wape_pct"] is None
    assert summary["forecast_hours"] == 1
    assert summary["coverage_pct"] == pytest.approx(100 / 24)


def test_metrics_formulas_signs_and_energy_units():
    result = metrics([{"forecast_mw": 100, "actual_mw": 80}, {"forecast_mw": 100, "actual_mw": 140}, {"forecast_mw": None, "actual_mw": 999}])
    assert result["mae_mw"] == 30
    assert result["bias_mw"] == -10
    assert result["rmse_mw"] == pytest.approx(math.sqrt(1000))
    assert result["wape_pct"] == pytest.approx(60 / 220 * 100)
    assert result["shortfall_mwh"] == 20
    assert result["surplus_mwh"] == 40
    assert result["paired_hours"] == 2
    assert result["forecast_energy_mwh"] == 200


def test_no_pairs_metrics_are_undefined():
    summary = metrics([])
    assert summary["paired_hours"] == 0
    assert summary["mae_mw"] is None
    assert summary["shortfall_mwh"] is None
    assert summary["coverage_pct"] == 0


@pytest.mark.parametrize("day,cutoff", [(date(2025, 12, 31), "09:00"), (date(2026, 2, 1), "09:00"), (FIRST, "24:00"), (FIRST, "9:00"), (FIRST, "09:60"), (FIRST, "09:00:00")])
def test_invalid_scope_or_cutoff_is_rejected(day, cutoff):
    with pytest.raises(ValueError):
        decision_time(day, cutoff)


def test_january_last_decision_targets_february_first():
    rows = Dataset([], []).day_rows(date(2026, 1, 31), "15:30")
    assert rows[0]["start_time"] == "2026-02-01T00:00:00Z"
    assert rows[-1]["start_time"] == "2026-02-01T23:00:00Z"
    assert len(rows) == 24
    assert decision_time(FIRST, "09:00").hour == 9


def test_duplicate_conflicts_and_invalid_values_fail_closed():
    with pytest.raises(ValueError, match="Conflicting"):
        Dataset([forecast(value=1), forecast(value=2)], [])
    for invalid in (-1, float("inf"), float("nan")):
        with pytest.raises(ValueError, match="finite"):
            Dataset([forecast(value=invalid)], [])
    with pytest.raises(ValueError, match="resolution"):
        Dataset([forecast(start="2026-01-02T00:30:00Z")], [])
    with pytest.raises(ValueError, match="timezone"):
        parse_timestamp("2026-01-01T00:00:00")


def test_identical_duplicates_are_idempotent_and_stale_is_visible():
    data = Dataset([forecast(published="2025-12-31T22:00:00Z")] * 2, [])
    row = data.day_rows(FIRST, "09:00")[0]
    assert row["stale"] is True
    assert row["forecast_age_hours"] == 11
    assert len(data.forecasts[parse_timestamp(row["start_time"])]) == 1


def test_linear_quantiles():
    assert quantile([0, 10], .9) == 9
    assert quantile([5], .1) == 5
    assert quantile([], .9) is None


def test_reference_does_not_use_future_actuals_or_first_day_hindsight():
    forecasts = []
    actuals = []
    for index in range(5):
        day = FIRST + timedelta(days=index)
        for hour in range(24):
            target = datetime(2026, 1, 2, tzinfo=timezone.utc) + timedelta(days=index, hours=hour)
            forecasts.append(forecast(target.isoformat(), f"{day}T08:00:00Z", 100))
            for offset in (0, 30):
                actuals.append(actual((target + timedelta(minutes=offset)).isoformat(), "2026-01-31T23:00:00Z", 1))
    data = Dataset(forecasts, actuals)
    assert not data.day(FIRST, "09:00")["historical_reference"]["sufficient"]
    assert data.day(date(2026, 1, 5), "09:00")["historical_reference"]["sample_hours"] == 0


def test_real_snapshot_scope_integrity_and_complete_coverage():
    data = load_dataset()
    summary = data.month("09:00")
    assert len(summary["days"]) == 31
    assert len(data.actuals) == 1488
    assert summary["metrics"]["paired_hours"] == 744
    assert summary["days"][-1]["delivery_date"] == "2026-02-01"
    assert not data.day(FIRST, "09:00")["historical_reference"]["sufficient"]


@pytest.mark.parametrize("cutoff", ["09:00", "09:20", "15:00", "15:30"])
def test_all_744_forecast_selections_against_independent_raw_oracle(cutoff):
    raw_f = json.loads(gzip.decompress((ROOT / "data/forecasts.json.gz").read_bytes()))
    raw_a = json.loads(gzip.decompress((ROOT / "data/actuals.json.gz").read_bytes()))
    # A separate simple implementation catches incorrect bisect, boundaries or alignment.
    by_target = {}
    for row in raw_f:
        by_target.setdefault(row["startTime"], []).append(row)
    actual_lookup = {}
    for row in sorted(raw_a, key=lambda row: row["publishTime"]):
        if row["fuelType"] == "WIND":
            actual_lookup[row["startTime"]] = row["generation"]
    for selected in load_dataset().month(cutoff)["days"]:
        boundary = f'{selected["decision_date"]}T{cutoff}:00Z'
        for row in selected["hours"]:
            eligible = [f for f in by_target.get(row["start_time"], []) if f["publishTime"] < boundary]
            expected = max(eligible, key=lambda f: f["publishTime"]) if eligible else None
            assert row["forecast_mw"] == (expected["generation"] if expected else None)
            half = (parse_timestamp(row["start_time"]) + timedelta(minutes=30)).isoformat().replace("+00:00", "Z")
            assert row["actual_mw"] == (actual_lookup[row["start_time"]] + actual_lookup[half]) / 2


def test_publication_history_marks_the_selected_vintage():
    data = load_dataset()
    rows = data.publications(date(2026, 1, 15), "09:00")
    assert sum(row["selected_hours"] for row in rows) == 24
    assert all(row["eligible"] for row in rows if row["selected_hours"])
    assert any(not row["eligible"] for row in rows)
