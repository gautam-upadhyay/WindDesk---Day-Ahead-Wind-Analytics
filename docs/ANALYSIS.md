# January 2026 pilot analysis

These figures are calculated from the bundled real Elexon snapshot, not simulated or extrapolated. Cohort: 1–31 January purchase decisions; delivery: 2 January–1 February. Both data streams are complete after hourly alignment: 744 eligible forecasts, 1,488 actual half-hours, 744 matched hours.

## Cutoff comparison

| Information cutoff, London | MAE, MW | RMSE, MW | Bias, MW | WAPE | Shortfall hours |
| --- | ---: | ---: | ---: | ---: | ---: |
| 09:00 | 2,038.91 | 2,504.76 | +1,747.89 | 18.07% | 632 / 744 |
| 09:20 | 2,038.91 | 2,504.76 | +1,747.89 | 18.07% | 632 / 744 |
| 15:00 | 1,904.01 | 2,361.10 | +1,692.47 | 16.87% | 636 / 744 |
| 15:30 | 1,904.01 | 2,361.10 | +1,692.47 | 16.87% | 636 / 744 |

09:00 and 09:20 select the same eligible records in this snapshot. Likewise, the conservative strict-before rule excludes any 15:30 publication at the 15:30 cutoff. Publication timestamps in the actual response, rather than assumed release schedules, determine eligibility.

The later information set has approximately **6.62% lower MAE** for this cohort. It is available only after the morning decision, so it cannot be used to claim an improved morning procurement strategy. The sample describes one month, without statistical uncertainty or an out-of-sample test; it is not evidence of persistent improvement.

## What the morning decision reveals

- Forecast energy: **9,695.395 GWh** across the cohort.
- Recorded actual energy: **8,394.967 GWh**.
- Gross wind shortfall: **1,408.6895 GWh**; gross surplus: **108.2615 GWh**.
- Net forecast overestimate: **1,300.428 GWh**. This equals bias × 744 hours and does not equal gross shortfall.
- P90 absolute hourly error: **4,097.9 MW** (retrospective full-cohort statistic).
- Largest daily MAE: decision **27 January**, delivery **28 January**, **5,374.79 MW**. Other large misses: 11 January (**4,868.25 MW**) and 10 January (**4,801.65 MW**).

This is actionable as a reason to inspect systematic wind exposure and the worst delivery periods. It is not an instruction to buy that quantity of thermal energy: the client’s exposure depends on demand, contracted supply and portfolio share, none of which is in scope. Aggregate measurement populations, operational curtailment and actual revisions may contribute to the difference; these datasets alone cannot isolate forecast-model error causally.

## A decision-day reference without future information

For the **15 January 09:00** decision, **320 hourly errors across 14 earlier decisions** have both actual half-hours published before the cutoff. Their 90th signed error percentile is **4,328.5 MW**. The UI calls this a historical reference, shows the sample count and permits an optional 10th–90th error range around the selected forecast.

These observations are correlated. The first decisions have too little in-scope history and display no range until 48 observable hours exist. We deliberately avoid using full-January statistics or February information for this decision-day reference. No probability of future coverage or calibrated reserve recommendation is claimed.

## Reproduce

```powershell
.venv\Scripts\python.exe -c "from backend.domain import load_dataset; print(load_dataset().month('09:00')['metrics'])"
```

Or inspect `/api/v1/overview?cutoff=09:00`, `/api/v1/day?decision_date=2026-01-15&cutoff=09:00` and the CSV exports. Every decision is checked against a separate raw-record oracle in `tests/test_domain.py` for all four cutoff presets.
