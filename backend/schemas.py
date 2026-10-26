"""Public v1 response contracts. Keep names/units aligned with src/types.ts."""

from pydantic import BaseModel, ConfigDict


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Metrics(Contract):
    expected_hours: int
    forecast_hours: int
    actual_hours: int
    paired_hours: int
    coverage_pct: float
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    wape_pct: float | None
    p90_absolute_error_mw: float | None
    shortfall_hours: int
    shortfall_mwh: float | None
    surplus_mwh: float | None
    forecast_energy_mwh: float
    actual_energy_mwh: float


class Hour(Contract):
    start_time: str
    hour: int
    forecast_mw: float | None
    actual_mw: float | None
    error_mw: float | None
    publish_time: str | None
    actual_publish_time: str | None
    actual_half_hours: int
    forecast_age_hours: float | None
    lead_hours: float | None
    stale: bool
    reference_low_mw: float | None = None
    reference_high_mw: float | None = None


class DaySummary(Contract):
    decision_date: str
    delivery_date: str
    metrics: Metrics
    hours: list[Hour]


class HistoricalReference(Contract):
    sample_hours: int
    sample_days: int
    minimum_hours: int
    sufficient: bool
    p90_shortfall_mw: float | None
    description: str


class Day(DaySummary):
    cutoff: str
    as_of: str
    publications_used: list[str]
    stale_hours: int
    historical_reference: HistoricalReference


class HourlyMetrics(Metrics):
    hour: int


class ErrorBin(Contract):
    from_mw: int
    to_mw: int
    label: str
    count: int


class Overview(Contract):
    cutoff: str
    metrics: Metrics
    days: list[DaySummary]
    hourly_profile: list[HourlyMetrics]
    distribution: list[ErrorBin]


class Publication(Contract):
    publish_time: str
    eligible: bool
    selected_hours: int
    target_hours: int
    mean_generation_mw: float


class Publications(Contract):
    decision_date: str
    cutoff: str
    publications: list[Publication]
