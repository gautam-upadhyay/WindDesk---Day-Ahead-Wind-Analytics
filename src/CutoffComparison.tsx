import { useState } from "react";
import { useApi } from "./api";
import { dateLabel, gw, number, signed } from "./format";
import type { Overview } from "./types";

const cutoffs = ["09:00", "09:20", "15:00", "15:30"];
export default function CutoffComparison({
  date,
  selected,
  choose,
}: {
  date: string;
  selected: string;
  choose: (cutoff: string) => void;
}) {
  const [decision, setDecision] = useState(date);
  // Fixed hook count; these four public responses share the existing bounded cache.
  const early = useApi<Overview>("/api/v1/overview?cutoff=09:00");
  const morning = useApi<Overview>("/api/v1/overview?cutoff=09:20");
  const afternoon = useApi<Overview>("/api/v1/overview?cutoff=15:00");
  const late = useApi<Overview>("/api/v1/overview?cutoff=15:30");
  const queries = [early, morning, afternoon, late];
  const failed = queries.find((query) => query.error);
  const ready = queries.every(
    (query) => query.data && !query.loading && !query.error,
  );
  const cohorts = queries.map((query) =>
    query.data?.days
      .flatMap((day) =>
        day.hours
          .filter(
            (hour) => hour.forecast_mw !== null && hour.actual_mw !== null,
          )
          .map((hour) => hour.start_time),
      )
      .sort()
      .join("|"),
  );
  const comparable = ready && cohorts.every((cohort) => cohort === cohorts[0]);
  const rows: { label: string; value: (overview: Overview) => string }[] = [
    {
      label: `Delivery-day forecast energy · GWh`,
      value: (overview) => {
        const day = overview.days.find((day) => day.decision_date === decision);
        return day ? number(day.metrics.forecast_energy_mwh / 1000, 1) : "—";
      },
    },
    {
      label: "January MAE · GW",
      value: (overview) => gw(overview.metrics.mae_mw),
    },
    {
      label: "January bias · MW",
      value: (overview) => signed(overview.metrics.bias_mw),
    },
    {
      label: "January gross wind shortfall · GWh",
      value: (overview) =>
        overview.metrics.shortfall_mwh === null
          ? "—"
          : number(overview.metrics.shortfall_mwh / 1000, 1),
    },
    {
      label: "January matched hours",
      value: (overview) =>
        `${overview.metrics.paired_hours}/${overview.metrics.expected_hours}`,
    },
  ];
  return (
    <section
      className="panel cutoff-comparison"
      aria-labelledby="comparison-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">INFORMATION CHANGES THROUGH THE DAY</p>
          <h2 id="comparison-title">Compare information cutoffs</h2>
        </div>
        <label className="small-select">
          Forecast decision date
          <input
            type="date"
            aria-label="Comparison decision date"
            min="2026-01-01"
            max="2026-01-31"
            value={decision}
            onChange={(event) => {
              if (/^2026-01-(0[1-9]|[12]\d|3[01])$/.test(event.target.value))
                setDecision(event.target.value);
            }}
          />
        </label>
      </div>
      <p className="panel-note">
        Forecast energy uses the delivery day following{" "}
        {dateLabel(decision, { day: "numeric", month: "long" })}. Error metrics
        cover all 31 January decisions and are retrospective. Later information
        is not necessarily more accurate.
      </p>
      {failed ? (
        <div role="alert" className="comparison-status">
          <p>{failed.error}</p>
          <button
            className="button"
            onClick={() =>
              queries
                .filter((query) => query.error)
                .forEach((query) => query.retry())
            }
          >
            Retry comparison
          </button>
        </div>
      ) : !ready ? (
        <p className="comparison-status" role="status">
          Loading the four information sets…
        </p>
      ) : (
        <>
          <div
            className="table-scroll"
            role="region"
            aria-label="Scrollable cutoff comparison"
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                Four cutoff comparison, national Elexon wind only. January error
                metrics; selected decision's delivery-day forecast energy.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  {cutoffs.map((cutoff) => (
                    <th scope="col" key={cutoff}>
                      {cutoff} GMT
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {queries.map((query, index) => (
                      <td className="tabular" key={cutoffs[index]}>
                        {row.value(query.data!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Explore this information set</th>
                  {cutoffs.map((cutoff) => (
                    <td key={cutoff}>
                      <button
                        className="text-button"
                        aria-pressed={selected === cutoff}
                        onClick={() => choose(cutoff)}
                      >
                        {selected === cutoff
                          ? "Selected cutoff"
                          : `Use ${cutoff}`}
                      </button>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={`panel-note ${comparable ? "" : "warning"}`}>
            {comparable
              ? "All four cutoffs use the same matched delivery hours."
              : "Matched delivery hours differ between cutoffs; these error metrics are not directly comparable."}{" "}
            Positive bias means wind was overestimated. Wind shortfall is not a
            procurement quantity.
          </p>
        </>
      )}
    </section>
  );
}
