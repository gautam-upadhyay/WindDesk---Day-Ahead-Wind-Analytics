"""Point-in-time selection and metrics. All power is MW; hourly energy is MWh."""

from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
from statistics import mean
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
LONDON = ZoneInfo("Europe/London")
FIRST = date(2026, 1, 1)
LAST = date(2026, 1, 31)
UTC = timezone.utc


def parse_timestamp(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timestamp must contain a timezone")
    return result.astimezone(UTC)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def decision_time(day: date, cutoff: str) -> datetime:
    if not FIRST <= day <= LAST:
        raise ValueError("Decision date must be between 2026-01-01 and 2026-01-31")
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", cutoff):
        raise ValueError("Cutoff must be a valid 24-hour HH:MM time")
    return datetime.combine(day, time.fromisoformat(cutoff), LONDON).astimezone(UTC)


def quantile(values: list[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * probability
    lower = math.floor(index)
    upper = math.ceil(index)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)


def metrics(rows: list[dict]) -> dict:
    pairs = [row for row in rows if row["forecast_mw"] is not None and row["actual_mw"] is not None]
    errors = [row["forecast_mw"] - row["actual_mw"] for row in pairs]
    denominator = sum(row["actual_mw"] for row in pairs)
    return {
        "expected_hours": len(rows),
        "forecast_hours": sum(row["forecast_mw"] is not None for row in rows),
        "actual_hours": sum(row["actual_mw"] is not None for row in rows),
        "paired_hours": len(pairs),
        "coverage_pct": len(pairs) / len(rows) * 100 if rows else 0,
        "mae_mw": mean([abs(error) for error in errors]) if errors else None,
        "rmse_mw": math.sqrt(mean([error ** 2 for error in errors])) if errors else None,
        "bias_mw": mean(errors) if errors else None,
        "wape_pct": sum(abs(error) for error in errors) / denominator * 100 if denominator else None,
        "p90_absolute_error_mw": quantile([abs(error) for error in errors], .9),
        "shortfall_hours": sum(error > 0 for error in errors),
        "shortfall_mwh": sum(max(error, 0) for error in errors) if errors else None,
        "surplus_mwh": sum(max(-error, 0) for error in errors) if errors else None,
        "forecast_energy_mwh": sum(row["forecast_mw"] for row in rows if row["forecast_mw"] is not None),
        "actual_energy_mwh": sum(row["actual_mw"] for row in rows if row["actual_mw"] is not None),
    }


@dataclass(frozen=True)
class Record:
    start: datetime
    published: datetime
    generation: float


class Dataset:
    def __init__(self, forecasts: list[dict], actuals: list[dict], manifest: dict | None = None):
        self.manifest = manifest or {}
        self.forecasts: dict[datetime, list[Record]] = {}
        self.actuals: dict[datetime, Record] = {}
        for kind, rows in (("forecast", forecasts), ("actual", actuals)):
            seen: dict[tuple, float] = {}
            for raw in rows:
                if kind == "actual" and raw.get("fuelType") != "WIND":
                    continue
                start, published = parse_timestamp(raw["startTime"]), parse_timestamp(raw["publishTime"])
                generation = float(raw["generation"])
                if not math.isfinite(generation) or generation < 0:
                    raise ValueError("Generation must be a finite non-negative MW value")
                if start.second or start.microsecond or start.minute not in ((0,) if kind == "forecast" else (0, 30)):
                    raise ValueError(f"Unexpected {kind} resolution: {start}")
                key = (start, published)
                if key in seen:
                    if seen[key] != generation:
                        raise ValueError(f"Conflicting {kind} duplicate at {key}")
                    continue
                seen[key] = generation
                record = Record(start, published, generation)
                if kind == "forecast":
                    self.forecasts.setdefault(start, []).append(record)
                elif start not in self.actuals or published > self.actuals[start].published:
                    self.actuals[start] = record
        for records in self.forecasts.values():
            records.sort(key=lambda row: row.published)
        self.publication_times = {start: [row.published for row in rows] for start, rows in self.forecasts.items()}

    def select(self, target: datetime, cutoff: datetime) -> Record | None:
        records = self.forecasts.get(target, [])
        # Exclusive cutoff is deliberately conservative at auction closure.
        index = bisect_left(self.publication_times.get(target, []), cutoff) - 1
        return records[index] if index >= 0 else None

    def day_rows(self, day: date, cutoff: str) -> list[dict]:
        as_of = decision_time(day, cutoff)
        delivery = datetime.combine(day + timedelta(days=1), time(), LONDON).astimezone(UTC)
        result = []
        for hour in range(24):
            target = delivery + timedelta(hours=hour)
            forecast = self.select(target, as_of)
            halves = [self.actuals.get(target), self.actuals.get(target + timedelta(minutes=30))]
            complete = all(row is not None for row in halves)
            actual = mean([row.generation for row in halves if row]) if complete else None
            actual_published = max([row.published for row in halves if row]) if complete else None
            fvalue = forecast.generation if forecast else None
            age = (as_of - forecast.published).total_seconds() / 3600 if forecast else None
            result.append({
                "start_time": iso(target), "hour": hour, "forecast_mw": fvalue,
                "actual_mw": actual,
                "error_mw": fvalue - actual if fvalue is not None and actual is not None else None,
                "publish_time": iso(forecast.published) if forecast else None,
                "actual_publish_time": iso(actual_published) if actual_published else None,
                "actual_half_hours": sum(row is not None for row in halves),
                "forecast_age_hours": age,
                "lead_hours": (target - forecast.published).total_seconds() / 3600 if forecast else None,
                "stale": age is not None and age > 8,
            })
        return result

    @lru_cache(maxsize=48)
    def month(self, cutoff: str = "09:00") -> dict:
        decision_time(FIRST, cutoff)
        days = []
        rows = []
        for index in range(31):
            day = FIRST + timedelta(days=index)
            daily = self.day_rows(day, cutoff)
            days.append({"decision_date": str(day), "delivery_date": str(day + timedelta(days=1)), "metrics": metrics(daily), "hours": daily})
            rows.extend(daily)
        errors = [row["error_mw"] for row in rows if row["error_mw"] is not None]
        distribution = []
        if errors:
            width = max(250, math.ceil((max(errors) - min(errors)) / 12 / 250) * 250)
            left = math.floor(min(errors) / width) * width
            right = math.floor(max(errors) / width) * width
            for low in range(left, right + width, width):
                distribution.append({"from_mw": low, "to_mw": low + width, "label": f"{low / 1000:g}", "count": sum(low <= error < low + width for error in errors)})
        profile = []
        for hour in range(24):
            hourly = [row for row in rows if row["hour"] == hour]
            profile.append({"hour": hour, **metrics(hourly)})
        return {"cutoff": cutoff, "metrics": metrics(rows), "days": days, "hourly_profile": profile, "distribution": distribution}

    def day(self, day: date, cutoff: str) -> dict:
        as_of = decision_time(day, cutoff)
        rows = self.day_rows(day, cutoff)
        history = []
        historical_days = 0
        for prior in self.month(cutoff)["days"]:
            if prior["decision_date"] >= str(day):
                break
            available = [row["error_mw"] for row in prior["hours"] if row["error_mw"] is not None and row["actual_publish_time"] and parse_timestamp(row["actual_publish_time"]) < as_of]
            if available:
                historical_days += 1
                history.extend(available)
        sufficient = len(history) >= 48
        lower, upper = (quantile(history, .1), quantile(history, .9)) if sufficient else (None, None)
        for row in rows:
            fvalue = row["forecast_mw"]
            row["reference_low_mw"] = max(0, fvalue - upper) if fvalue is not None and upper is not None else None
            row["reference_high_mw"] = max(0, fvalue - lower) if fvalue is not None and lower is not None else None
        return {
            "decision_date": str(day), "delivery_date": str(day + timedelta(days=1)),
            "cutoff": cutoff, "as_of": iso(as_of), "hours": rows, "metrics": metrics(rows),
            "publications_used": sorted({row["publish_time"] for row in rows if row["publish_time"]}),
            "stale_hours": sum(row["stale"] for row in rows),
            "historical_reference": {
                "sample_hours": len(history), "sample_days": historical_days, "minimum_hours": 48,
                "sufficient": sufficient,
                "p90_shortfall_mw": max(0, upper) if upper is not None else None,
                "description": "10th–90th empirical error percentiles from earlier January decisions whose actuals were published before this cutoff. Not a calibrated prediction interval; hourly errors are correlated.",
            },
        }

    def publications(self, day: date, cutoff: str) -> list[dict]:
        as_of = decision_time(day, cutoff)
        start = datetime.combine(day + timedelta(days=1), time(), LONDON).astimezone(UTC)
        end = start + timedelta(days=1)
        groups: dict[datetime, list[Record]] = {}
        selected = {self.select(start + timedelta(hours=hour), as_of) for hour in range(24)}
        for target, records in self.forecasts.items():
            if start <= target < end:
                for record in records:
                    groups.setdefault(record.published, []).append(record)
        return [{
            "publish_time": iso(published), "eligible": published < as_of,
            "selected_hours": sum(record in selected for record in records),
            "target_hours": len(records), "mean_generation_mw": mean([record.generation for record in records]),
        } for published, records in sorted(groups.items(), reverse=True)]


@lru_cache(maxsize=1)
def load_dataset() -> Dataset:
    folder = ROOT / "data"
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    content = {}
    for name in ("forecasts", "actuals"):
        filename = f"{name}.json.gz"
        encoded = (folder / filename).read_bytes()
        if hashlib.sha256(encoded).hexdigest() != manifest["files"][filename]["sha256"]:
            raise ValueError(f"Snapshot integrity check failed: {filename}")
        content[name] = json.loads(gzip.decompress(encoded))
        if len(content[name]) != manifest["files"][filename]["rows"]:
            raise ValueError(f"Snapshot row count mismatch: {filename}")
    if not content["forecasts"] or not content["actuals"]:
        raise ValueError("Snapshot contains no data")
    return Dataset(content["forecasts"], content["actuals"], manifest)
