export interface Metrics {
  expected_hours: number;
  forecast_hours: number;
  actual_hours: number;
  paired_hours: number;
  coverage_pct: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  wape_pct: number | null;
  p90_absolute_error_mw: number | null;
  shortfall_hours: number;
  shortfall_mwh: number | null;
  surplus_mwh: number | null;
  forecast_energy_mwh: number;
  actual_energy_mwh: number;
}
export interface Hour {
  start_time: string;
  hour: number;
  forecast_mw: number | null;
  actual_mw: number | null;
  error_mw: number | null;
  publish_time: string | null;
  actual_publish_time: string | null;
  actual_half_hours: number;
  forecast_age_hours: number | null;
  lead_hours: number | null;
  stale: boolean;
  reference_low_mw?: number | null;
  reference_high_mw?: number | null;
}
export interface DaySummary {
  decision_date: string;
  delivery_date: string;
  metrics: Metrics;
  hours: Hour[];
}
export interface Day extends DaySummary {
  cutoff: string;
  as_of: string;
  publications_used: string[];
  stale_hours: number;
  historical_reference: {
    sample_hours: number;
    sample_days: number;
    minimum_hours: number;
    sufficient: boolean;
    p90_shortfall_mw: number | null;
    description: string;
  };
}
export interface Overview {
  cutoff: string;
  metrics: Metrics;
  days: DaySummary[];
  hourly_profile: (Metrics & { hour: number })[];
  distribution: {
    from_mw: number;
    to_mw: number;
    label: string;
    count: number;
  }[];
}
export interface Publication {
  publish_time: string;
  eligible: boolean;
  selected_hours: number;
  target_hours: number;
  mean_generation_mw: number;
}
export interface Provenance {
  upstream_verification: {
    status: string;
    checked_at: string | null;
    matched_records?: number;
    requests_checked?: number;
  };
  retrieved_at: string;
  source: string;
  attribution: string;
  licence: string;
  selection: string;
  actuals: string;
  scope: string;
  files: Record<string, { rows: number; bytes: number; sha256: string }>;
  requests: { url: string; rows: number; response_sha256: string }[];
}
export type View = "home" | "workspace" | "desk" | "accuracy" | "method";
