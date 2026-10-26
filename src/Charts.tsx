import { memo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  LineChart,
} from "recharts";
import type { Day, Overview } from "./types";
import { gw, hourLabel, number } from "./format";

const axis = {
  fontSize: 13,
  fill: "var(--muted)",
  fontFamily: "inherit",
};
const tooltipStyle = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  background: "var(--surface)",
  color: "var(--ink)",
  boxShadow: "0 8px 28px var(--shadow-color)",
  fontSize: 14,
  padding: "12px 16px",
};

export function WindChart({
  day,
  showActuals,
  showReference,
  selectedHour,
}: {
  day: Day;
  showActuals: boolean;
  showReference: boolean;
  selectedHour?: number | null;
}) {
  const data = day.hours.map((row) => ({
    ...row,
    range:
      row.reference_low_mw != null && row.reference_high_mw != null
        ? [row.reference_low_mw, row.reference_high_mw]
        : null,
  }));
  return (
    <div
      className="wind-chart"
      role="img"
      aria-label="Hourly wind forecast chart. Exact values are available in the interval table below."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 12, left: 4, bottom: 2 }}
        >
          <defs>
            <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.24} />
              <stop
                offset="100%"
                stopColor="var(--accent)"
                stopOpacity={0.01}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="hour"
            ticks={[0, 3, 6, 9, 12, 15, 18, 21, 23]}
            tickFormatter={hourLabel}
            axisLine={false}
            tickLine={false}
            tick={axis}
            dy={10}
          />
          <YAxis
            tickFormatter={(value) => `${number(Number(value) / 1000, 0)}`}
            axisLine={false}
            tickLine={false}
            tick={axis}
            width={42}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(value) =>
              `${hourLabel(Number(value))} GMT · ${day.delivery_date}`
            }
            formatter={(value, name) => {
              if (name === "Reference range")
                return [
                  Array.isArray(value)
                    ? value.map((v) => `${gw(Number(v))}`).join(" – ") + " GW"
                    : "—",
                  name,
                ];
              return [`${gw(Number(value))} GW`, name];
            }}
          />
          {selectedHour != null && (
            <ReferenceLine
              x={selectedHour}
              stroke="var(--accent)"
              strokeDasharray="4 4"
            />
          )}
          {showReference && (
            <Area
              isAnimationActive={false}
              type="linear"
              dataKey="range"
              name="Reference range"
              fill="var(--accent-soft)"
              fillOpacity={0.55}
              stroke="none"
              connectNulls={false}
            />
          )}
          <Area
            isAnimationActive={false}
            type="linear"
            dataKey="forecast_mw"
            name="Selected forecast"
            stroke="var(--accent)"
            strokeWidth={2.5}
            fill="url(#forecastFill)"
            activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--surface)" }}
            connectNulls={false}
          />
          {showActuals && (
            <Line
              isAnimationActive={false}
              type="linear"
              dataKey="actual_mw"
              name="Actual generation"
              stroke="var(--clay)"
              strokeWidth={2.1}
              strokeDasharray="5 4"
              dot={false}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AccuracyCharts({ overview }: { overview: Overview }) {
  return (
    <div className="two-columns charts-two">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">DAY BY DAY</p>
            <h2>How much did we miss?</h2>
          </div>
          <span className="legend">
            <i className="dot green" /> MAE <i className="dot clay" /> Bias
          </span>
        </div>
        <p className="panel-note">
          Error at {overview.cutoff} GMT, grouped by decision date · GW
        </p>
        <div className="small-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={overview.days.map((day) => ({
                day: Number(day.decision_date.slice(-2)),
                ...day.metrics,
              }))}
              margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tick={axis}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={axis}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => number(Number(value) / 1000, 1)}
                width={40}
              />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(value) => `Decision: ${value} Jan`}
                formatter={(value, name) => [`${gw(Number(value))} GW`, name]}
              />
              <Bar
                isAnimationActive={false}
                dataKey="mae_mw"
                name="MAE"
                fill="var(--accent)"
                radius={[3, 3, 0, 0]}
              />
              <Line
                isAnimationActive={false}
                dataKey="bias_mw"
                name="Bias"
                stroke="var(--clay)"
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ERROR DISTRIBUTION</p>
            <h2>Which way did it lean?</h2>
          </div>
        </div>
        <p className="panel-note">
          Forecast minus actual · negative = surplus, positive = shortfall
        </p>
        <div className="small-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={overview.distribution}
              margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={axis}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={axis}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={34}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload;
                  return row ? `${gw(row.from_mw)} to ${gw(row.to_mw)} GW` : "";
                }}
              />
              <Bar
                isAnimationActive={false}
                dataKey="count"
                name="Hours"
                fill="var(--accent)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel full-width">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">TIME OF DELIVERY</p>
            <h2>When is the forecast most reliable?</h2>
          </div>
          <span className="legend">
            <i className="dot green" /> MAE <i className="dot clay" /> RMSE
          </span>
        </div>
        <p className="panel-note">
          Across 31 decisions at {overview.cutoff} GMT · GW
        </p>
        <div className="small-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={overview.hourly_profile}
              margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="hour"
                tickFormatter={hourLabel}
                tick={axis}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={axis}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(value) => number(Number(value) / 1000, 1)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(value) => hourLabel(Number(value))}
                formatter={(value, name) => [`${gw(Number(value))} GW`, name]}
              />
              <Line
                isAnimationActive={false}
                dataKey="mae_mw"
                name="MAE"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                isAnimationActive={false}
                dataKey="rmse_mw"
                name="RMSE"
                stroke="var(--clay)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

export default memo(WindChart);
