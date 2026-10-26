import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Info,
  LayoutDashboard,
  Menu,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserRound,
  Wind,
  X,
} from "lucide-react";
import { useApi } from "./api";
import Home from "./Home";
import Workspace, { useWorkspaceMemory } from "./Workspace";
import { useTheme } from "./theme";
import ErrorBoundary from "./ErrorBoundary";
import { useNavigationGuard } from "./NavigationGuard";
import type { AccountMode, Theme, User } from "./Account";
import {
  dateLabel,
  gw,
  hourLabel,
  number,
  signed,
  timeLabel,
  timestampLabel,
} from "./format";
import type {
  Day,
  Hour,
  Overview,
  Publication,
  Provenance,
  View,
} from "./types";

const WindChart = lazy(() => import("./Charts"));
const AccountDialog = lazy(() => import("./Account"));
const CutoffComparison = lazy(() => import("./CutoffComparison"));
const AccuracyCharts = lazy(() =>
  import("./Charts").then((module) => ({ default: module.AccuracyCharts })),
);

type State = { view: View; date: string; cutoff: string; hour: number | null };
type Action =
  | { type: "view"; value: View }
  | { type: "date"; value: string }
  | { type: "cutoff"; value: string }
  | { type: "interval"; date: string; hour: number }
  | { type: "restore"; value: State };
const cutoffs = ["09:00", "09:20", "15:00", "15:30"];
function initialState(): State {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("date") ?? "";
  return {
    view: ["home", "workspace", "desk", "accuracy", "method"].includes(
      params.get("view") ?? "",
    )
      ? (params.get("view") as View)
      : params.has("view")
        ? "desk"
        : "home",
    date: /^2026-01-(0[1-9]|[12]\d|3[01])$/.test(candidate)
      ? candidate
      : "2026-01-15",
    cutoff: cutoffs.includes(params.get("cutoff") ?? "")
      ? params.get("cutoff")!
      : "09:00",
    hour:
      /^(?:[0-9]|1[0-9]|2[0-3])$/.test(params.get("hour") ?? "") &&
      params.get("view") === "desk"
        ? Number(params.get("hour"))
        : null,
  };
}
function reducer(state: State, action: Action): State {
  if (action.type === "restore") return action.value;
  if (action.type === "interval")
    return { ...state, view: "desk", date: action.date, hour: action.hour };
  if (action.type === "date")
    return { ...state, date: action.value, view: "desk", hour: null };
  if (action.type === "view")
    return { ...state, view: action.value, hour: null };
  return { ...state, [action.type]: action.value };
}
function Metric({
  label,
  value,
  unit,
  detail,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "metric-accent" : ""}`}>
      <p>
        {label}
        <ArrowUpRight size={15} aria-hidden="true" />
      </p>
      <strong>
        {value}
        <span>{unit}</span>
      </strong>
      <small>{detail}</small>
    </div>
  );
}
function Loading({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`loading ${compact ? "compact" : ""}`} role="status">
      <RefreshCw size={22} className="spin" />
      <span>Loading verified Elexon data…</span>
    </div>
  );
}
function Failure({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <Info size={24} />
      <h2>We couldn’t load this view</h2>
      <p>{error}</p>
      <button className="button primary" onClick={retry}>
        <RefreshCw size={15} /> Try again
      </button>
    </div>
  );
}
function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={onChange}
      className="toggle-label"
    >
      <span className={`toggle ${value ? "on" : ""}`} />
      <span>{label}</span>
    </button>
  );
}

function IntervalTable({
  day,
  showActuals,
  selectedHour,
}: {
  day: Day;
  showActuals: boolean;
  selectedHour: number | null;
}) {
  const [sort, setSort] = useState<"hour" | "error">("hour");
  const selectedRow = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (selectedHour === null || !selectedRow.current) return;
    selectedRow.current.scrollIntoView({ block: "center", inline: "nearest" });
    selectedRow.current.focus({ preventScroll: true });
  }, [selectedHour, day]);
  const rows = useMemo(
    () =>
      sort === "hour" || !showActuals
        ? day.hours
        : [...day.hours].sort(
            (a, b) =>
              (b.error_mw == null ? -Infinity : Math.abs(b.error_mw)) -
              (a.error_mw == null ? -Infinity : Math.abs(a.error_mw)),
          ),
    [day.hours, sort, showActuals],
  );
  return (
    <section className="panel interval-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">THE NUMBERS BEHIND THE CURVE</p>
          <h2>Delivery intervals</h2>
        </div>
        <label className="small-select">
          Sort by
          <select
            value={showActuals ? sort : "hour"}
            onChange={(event) =>
              setSort(event.target.value as "hour" | "error")
            }
          >
            <option value="hour">Delivery time</option>
            {showActuals && <option value="error">Largest error</option>}
          </select>
        </label>
      </div>
      <div
        className="table-scroll"
        role="region"
        aria-label="Scrollable delivery interval table"
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">
            Hourly forecast values, publication times, and optional
            retrospective actuals. All times GMT.
          </caption>
          <thead>
            <tr>
              <th scope="col">Delivery · GMT</th>
              <th scope="col">Forecast · MW</th>
              {showActuals && (
                <>
                  <th scope="col">Actual · MW</th>
                  <th scope="col">Error · MW</th>
                </>
              )}
              <th scope="col">Published · GMT</th>
              <th scope="col">Lead time</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.start_time}
                ref={row.hour === selectedHour ? selectedRow : undefined}
                tabIndex={row.hour === selectedHour ? -1 : undefined}
                className={
                  row.hour === selectedHour ? "selected-interval" : undefined
                }
              >
                <th scope="row">
                  {row.hour === selectedHour && (
                    <span className="sr-only">Selected interval: </span>
                  )}
                  {hourLabel(row.hour)}
                  <span className="muted">
                    {" "}
                    – {hourLabel((row.hour + 1) % 24)}
                  </span>
                </th>
                <td className="tabular">{number(row.forecast_mw)}</td>
                {showActuals && (
                  <>
                    <td className="tabular">{number(row.actual_mw)}</td>
                    <td
                      className={`tabular ${row.error_mw != null && row.error_mw > 0 ? "text-clay" : "text-green"}`}
                    >
                      {signed(row.error_mw)}
                    </td>
                  </>
                )}
                <td>
                  {row.publish_time
                    ? timestampLabel(row.publish_time)
                    : "Unavailable"}
                </td>
                <td>{number(row.lead_hours, 1)} h</td>
                <td>
                  <span
                    className={`status ${row.forecast_mw == null || row.stale ? "amber" : ""}`}
                  >
                    {row.forecast_mw == null
                      ? "Missing"
                      : row.stale
                        ? "Older than 8h"
                        : "Available"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        24 hourly intervals · actuals require both half-hours{" "}
        <span>Positive error = forecast overestimated wind</span>
      </div>
    </section>
  );
}

function Publications({ date, cutoff }: { date: string; cutoff: string }) {
  const query = useApi<{ publications: Publication[] }>(
    `/api/v1/publications?decision_date=${date}&cutoff=${cutoff}`,
  );
  const [all, setAll] = useState(false);
  const rows = query.data?.publications ?? [];
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">A TRACEABLE DECISION</p>
          <h2>Publication history</h2>
        </div>
        <Clock3 size={20} className="muted" />
      </div>
      <p className="panel-note">
        Every vintage for this delivery day. Publications at or after the cutoff
        are excluded.
      </p>
      {query.loading ? (
        <Loading compact />
      ) : query.error ? (
        <Failure error={query.error} retry={query.retry} />
      ) : (
        <>
          <div className="publication-list">
            {(all
              ? rows
              : [
                  ...rows.filter((row) => row.selected_hours > 0),
                  ...rows.filter((row) => row.selected_hours === 0).slice(0, 3),
                ]
            ).map((row) => (
              <div
                className={`publication ${row.selected_hours ? "selected" : ""}`}
                key={row.publish_time}
              >
                <div className="publication-mark">
                  {row.selected_hours ? (
                    <Check size={14} />
                  ) : (
                    <Clock3 size={13} />
                  )}
                </div>
                <div>
                  <strong>
                    {timestampLabel(row.publish_time)} <span>GMT</span>
                  </strong>
                  <small>
                    {row.target_hours}/24 delivery hours ·{" "}
                    {gw(row.mean_generation_mw)} GW mean
                  </small>
                </div>
                <span className={`status ${!row.eligible ? "neutral" : ""}`}>
                  {row.selected_hours
                    ? `${row.selected_hours}h selected`
                    : row.eligible
                      ? "Earlier vintage"
                      : "After cutoff"}
                </span>
              </div>
            ))}
          </div>
          <button className="text-button" onClick={() => setAll(!all)}>
            {all
              ? "Show fewer publications"
              : `Inspect all ${rows.length} publications`}
            <ArrowRight size={14} />
          </button>
        </>
      )}
    </section>
  );
}

function Desk({
  state,
  dispatch,
  saved,
  saveDecision,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
  saved: boolean;
  saveDecision: () => void;
}) {
  const query = useApi<Day>(
    `/api/v1/day?decision_date=${state.date}&cutoff=${state.cutoff}`,
  );
  const [actuals, setActuals] = useState(state.hour !== null);
  useEffect(() => {
    if (state.hour !== null) setActuals(true);
  }, [state.hour]);
  const [reference, setReference] = useState(false);
  const deferredActuals = useDeferredValue(actuals);
  const deferredReference = useDeferredValue(reference);
  const day = query.data;
  const move = (delta: number) => {
    const next = new Date(`${state.date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + delta);
    dispatch({ type: "date", value: next.toISOString().slice(0, 10) });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DAY-AHEAD INTELLIGENCE</p>
          <h1>
            Clarity before the auction<span>.</span>
          </h1>
          <p>
            Know the wind. Understand the uncertainty. Make a better-informed
            decision.
          </p>
        </div>
        <div className="desk-actions">
          <button
            className={`button save-decision ${saved ? "is-saved" : ""}`}
            aria-pressed={saved}
            onClick={saveDecision}
          >
            <Bookmark size={16} />
            {saved ? "Decision saved" : "Save decision"}
          </button>
          <a
            className="button"
            href={`/api/v1/export.csv?decision_date=${state.date}&cutoff=${state.cutoff}`}
          >
            <ArrowDownToLine size={16} />
            Export day
          </a>
        </div>
      </div>
      <div className="decision-controls">
        <div className="decision-date">
          <CalendarDays size={18} />
          <label>
            Decision date
            <input
              type="date"
              min="2026-01-01"
              max="2026-01-31"
              value={state.date}
              onChange={(event) => {
                if (/^2026-01-(0[1-9]|[12]\d|3[01])$/.test(event.target.value))
                  dispatch({ type: "date", value: event.target.value });
              }}
            />
          </label>
          <div className="date-stepper">
            <button
              aria-label="Previous decision day"
              disabled={state.date === "2026-01-01"}
              onClick={() => move(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="Next decision day"
              disabled={state.date === "2026-01-31"}
              onClick={() => move(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="control-divider" />
        <div className="cutoff-control">
          <Clock3 size={18} />
          <label>
            Information cutoff
            <select
              aria-label="Information cutoff"
              value={state.cutoff}
              onChange={(event) =>
                dispatch({ type: "cutoff", value: event.target.value })
              }
            >
              {cutoffs.map((cutoff) => (
                <option key={cutoff}>{cutoff}</option>
              ))}
            </select>
          </label>
          <span className="timezone">GMT</span>
        </div>
        <div className="delivery-pill">
          <ArrowRight size={15} />
          Delivery{" "}
          <strong>
            {day
              ? dateLabel(day.delivery_date, { day: "numeric", month: "short" })
              : "…"}
          </strong>
        </div>
      </div>
      {query.loading ? (
        <div className="desk-loading" role="status">
          <div className="skeleton-context" aria-hidden="true" />
          <div className="metrics-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <div className="metric skeleton-metric" key={index}>
                <span />
                <strong />
                <span />
              </div>
            ))}
          </div>
          <div className="panel skeleton-chart">
            <RefreshCw size={22} className="spin" />
            <span>Loading verified Elexon data…</span>
          </div>
        </div>
      ) : query.error ? (
        <Failure error={query.error} retry={query.retry} />
      ) : (
        day && (
          <>
            <div className="context-strip">
              <span>
                <ShieldCheck size={15} />
                Only information published before {state.cutoff} GMT on{" "}
                {dateLabel(state.date, { day: "numeric", month: "short" })}
              </span>
              <span className="context-right">
                <i className="live-dot" />
                {day.metrics.forecast_hours}/24 forecast hours available
              </span>
            </div>
            <div className="metrics-grid">
              <Metric
                label="Forecast wind energy"
                value={number(day.metrics.forecast_energy_mwh / 1000, 1)}
                unit="GWh"
                detail={`${day.metrics.forecast_hours} forecast hours for ${dateLabel(day.delivery_date, { day: "numeric", month: "short" })}`}
                accent
              />
              <Metric
                label="Peak forecast output"
                value={gw(
                  Math.max(...day.hours.map((row) => row.forecast_mw ?? 0)),
                )}
                unit="GW"
                detail="Highest forecast delivery hour"
              />
              <Metric
                label="Historical P90 shortfall"
                value={gw(day.historical_reference.p90_shortfall_mw)}
                unit="GW"
                detail={
                  day.historical_reference.sufficient
                    ? `Prior ${day.historical_reference.sample_hours} observable hours · reference only`
                    : "Need 48 earlier observable hours"
                }
              />
              <Metric
                label="Latest selected vintage"
                value={timeLabel(day.publications_used.at(-1) ?? null)}
                unit="GMT"
                detail={
                  day.publications_used.length === 1
                    ? "One publication covers the delivery day"
                    : `${day.publications_used.length} publications used across the day`
                }
              />
            </div>
            <section className="panel forecast-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">
                    DELIVERY DAY · {dateLabel(day.delivery_date).toUpperCase()}
                  </p>
                  <h2>The wind picture</h2>
                </div>
                <span className="chart-unit">Wind generation · GW</span>
              </div>
              <div className="chart-toolbar">
                <div className="legend">
                  <span>
                    <i className="line-key" />
                    Selected forecast
                  </span>
                  {actuals && (
                    <span>
                      <i className="line-key actual" />
                      Actual generation
                    </span>
                  )}
                  {reference && (
                    <span>
                      <i className="range-key" />
                      Historical reference
                    </span>
                  )}
                </div>
                <div className="chart-toggles">
                  <Toggle
                    label="Past-error range"
                    value={reference && day.historical_reference.sufficient}
                    onChange={() => setReference(!reference)}
                    disabled={!day.historical_reference.sufficient}
                  />
                  <Toggle
                    label="Reveal actuals"
                    value={actuals}
                    onChange={() => setActuals(!actuals)}
                  />
                </div>
              </div>
              <div
                className="chart-frame"
                aria-busy={
                  actuals !== deferredActuals || reference !== deferredReference
                }
              >
                {(actuals !== deferredActuals ||
                  reference !== deferredReference) && (
                  <span className="chart-update" role="status">
                    Updating chart…
                  </span>
                )}
                <ErrorBoundary
                  key={`${state.date}-${state.cutoff}`}
                  label="The wind chart could not open"
                >
                  <Suspense fallback={<Loading />}>
                    <WindChart
                      day={day}
                      showActuals={actuals && deferredActuals}
                      selectedHour={state.hour}
                      showReference={
                        reference &&
                        deferredReference &&
                        day.historical_reference.sufficient
                      }
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
              <div className="chart-footnote">
                <Info size={14} />
                <p>
                  Hourly forecast as published. Actuals average two half-hours.
                  {reference
                    ? ` Reference uses ${day.historical_reference.sample_hours} earlier observable errors; it is not a calibrated prediction interval.`
                    : " Hover over the curve for values, or inspect the intervals below."}
                </p>
              </div>
            </section>
            {actuals && (
              <div className="retrospective-banner">
                <ChartColumn size={19} />
                <div>
                  <strong>Retrospective lens</strong>
                  <p>
                    Actuals were not available at this purchase decision. Daily
                    MAE: <b>{number(day.metrics.mae_mw)} MW</b> · bias:{" "}
                    <b>{signed(day.metrics.bias_mw)} MW</b> · WAPE:{" "}
                    <b>{number(day.metrics.wape_pct, 1)}%</b>.
                  </p>
                </div>
                <span className="status amber">Hindsight visible</span>
              </div>
            )}
            <div className="two-columns support-grid">
              <Publications
                key={`${state.date}-${state.cutoff}`}
                date={state.date}
                cutoff={state.cutoff}
              />
              <section className="panel desk-note">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">FROM SIGNAL TO DECISION</p>
                    <h2>A wind forecast, with context.</h2>
                  </div>
                  <Wind size={22} />
                </div>
                <div className="note-number">
                  01<span> / </span>03
                </div>
                <h3>Start with the information you had.</h3>
                <p>
                  The curve uses the latest eligible forecast for each delivery
                  hour. Later revisions cannot improve this historical decision.
                </p>
                <div className="note-rule" />
                <div className="note-row">
                  <span>02</span>
                  <p>
                    Use past errors to size the uncertainty. The P90 reference
                    describes earlier observed shortfalls; it is not a
                    purchasing recommendation.
                  </p>
                </div>
                <div className="note-row">
                  <span>03</span>
                  <p>
                    Bring your own demand and contracted supply to determine the
                    remaining power purchase.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => dispatch({ type: "view", value: "accuracy" })}
                >
                  Explore January’s forecast accuracy
                  <ArrowUpRight size={15} />
                </button>
                {day.stale_hours > 0 && (
                  <p className="warning">
                    {day.stale_hours} forecasts were over 8 hours old at the
                    cutoff.
                  </p>
                )}
              </section>
            </div>
            {state.hour !== null &&
              (() => {
                const interval = day.hours.find(
                  (row) => row.hour === state.hour,
                );
                return (
                  interval && (
                    <section
                      className="panel interval-detail"
                      aria-labelledby="interval-detail-title"
                    >
                      <div className="panel-heading">
                        <div>
                          <p className="eyebrow">
                            SELECTED FROM ACCURACY ANALYSIS
                          </p>
                          <h2 id="interval-detail-title">
                            Delivery interval · {hourLabel(interval.hour)} GMT
                          </h2>
                        </div>
                        <span className="status amber">
                          Retrospective drill-down
                        </span>
                      </div>
                      <p className="panel-note">
                        {dateLabel(day.delivery_date, {
                          day: "numeric",
                          month: "long",
                        })}{" "}
                        delivery · {state.cutoff} GMT decision cutoff. Published
                        forecast:{" "}
                        {interval.publish_time
                          ? timestampLabel(interval.publish_time)
                          : "Unavailable"}{" "}
                        GMT.
                      </p>
                      <dl className="interval-values">
                        <div>
                          <dt>Forecast · MW</dt>
                          <dd>{number(interval.forecast_mw)}</dd>
                        </div>
                        {actuals && (
                          <>
                            <div>
                              <dt>Actual · MW</dt>
                              <dd>{number(interval.actual_mw)}</dd>
                            </div>
                            <div>
                              <dt>Forecast − actual · MW</dt>
                              <dd>{signed(interval.error_mw)}</dd>
                            </div>
                          </>
                        )}
                      </dl>
                      <p className="panel-note">
                        The matching row is highlighted below. Actuals describe
                        the delivered outcome and were not known at the buying
                        cutoff.
                      </p>
                    </section>
                  )
                );
              })()}
            <IntervalTable
              key={`${state.date}-${actuals}`}
              day={day}
              showActuals={actuals}
              selectedHour={state.hour}
            />
          </>
        )
      )}
    </>
  );
}

function Heatmap({
  overview,
  select,
}: {
  overview: Overview;
  select: (date: string, hour?: number) => void;
}) {
  const values = overview.days.flatMap((day) =>
    day.hours.map((row) => Math.abs(row.error_mw ?? 0)),
  );
  const scale = Math.max(...values, 1);
  function colour(row: Hour) {
    if (row.error_mw == null) return "var(--heat-empty)";
    const weight = Math.min(Math.abs(row.error_mw) / scale, 1);
    const color = row.error_mw > 0 ? "--heat-shortfall" : "--heat-surplus";
    return `color-mix(in srgb, var(${color}) ${12 + weight * 88}%, var(--heat-empty))`;
  }
  return (
    <section className="panel heatmap-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">THE FULL PICTURE</p>
          <h2>31 decisions. Every delivery hour.</h2>
        </div>
        <div className="heat-legend">
          <span>Surplus</span>
          <i />
          <span>Shortfall</span>
        </div>
      </div>
      <p className="panel-note">
        Select a decision date to replay it. Each cell is forecast minus actual
        for the following delivery day.
      </p>
      <div className="heatmap-scroll">
        <div className="heatmap">
          <div className="heatmap-labels">
            <span>JAN</span>
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour}>{hour % 3 === 0 ? hourLabel(hour) : ""}</span>
            ))}
          </div>
          {overview.days.map((day) => (
            <div className="heatmap-row" key={day.decision_date}>
              <button
                className="heatmap-day"
                onClick={() => select(day.decision_date)}
                aria-label={`Replay decision ${day.decision_date}`}
              >
                {day.decision_date.slice(-2)}
              </button>
              {day.hours.map((row) => (
                <button
                  key={row.start_time}
                  onClick={() => select(day.decision_date, row.hour)}
                  style={{ background: colour(row) }}
                  title={`${day.decision_date} decision · ${hourLabel(row.hour)} delivery · ${signed(row.error_mw)} MW`}
                  aria-label={`${day.decision_date} decision, ${hourLabel(row.hour)} delivery, error ${signed(row.error_mw)} MW`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="table-footer">
        <span>Decision dates · 1–31 Jan 2026</span>
        <span>
          Delivery dates · 2 Jan–1 Feb 2026 · missing pairs shown grey
        </span>
      </div>
    </section>
  );
}

function Accuracy({
  state,
  dispatch,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
}) {
  const query = useApi<Overview>(`/api/v1/overview?cutoff=${state.cutoff}`);
  const data = query.data;
  const [comparison, setComparison] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MEASURED, NOT ASSUMED</p>
          <h1>
            How good was the forecast<span>?</span>
          </h1>
          <p>
            A fair backtest of the wind information available for January
            purchase decisions.
          </p>
        </div>
        <a
          className="button"
          href={`/api/v1/export.csv?cutoff=${state.cutoff}`}
        >
          <ArrowDownToLine size={16} />
          Export month
        </a>
      </div>
      <div className="accuracy-controls">
        <span>
          <CalendarDays size={17} />
          1–31 Jan 2026 decisions
        </span>
        <label>
          Daily information cutoff
          <select
            value={state.cutoff}
            onChange={(event) =>
              dispatch({ type: "cutoff", value: event.target.value })
            }
          >
            {cutoffs.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          GMT
        </label>
        <span className="status amber">Retrospective analysis</span>
      </div>
      <div className="comparison-action">
        <button
          className="button"
          aria-expanded={comparison}
          aria-controls="cutoff-comparison-section"
          onClick={() => setComparison(!comparison)}
        >
          {comparison ? "Hide cutoff comparison" : "Compare all four cutoffs"}
        </button>
      </div>
      {comparison && (
        <div id="cutoff-comparison-section">
          <ErrorBoundary label="The comparison could not open">
            <Suspense fallback={<Loading compact />}>
              <CutoffComparison
                date={state.date}
                selected={state.cutoff}
                choose={(value) => dispatch({ type: "cutoff", value })}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={query.retry} />
      ) : (
        data && (
          <>
            <div className="metrics-grid">
              <Metric
                label="Mean absolute error"
                value={gw(data.metrics.mae_mw)}
                unit="GW"
                detail="Average magnitude of the hourly error"
                accent
              />
              <Metric
                label="Root mean squared error"
                value={gw(data.metrics.rmse_mw)}
                unit="GW"
                detail="Gives larger misses more weight"
              />
              <Metric
                label="Forecast bias"
                value={signed(data.metrics.bias_mw)}
                unit="MW"
                detail="Positive = wind was overestimated"
              />
              <Metric
                label="Weighted absolute error"
                value={number(data.metrics.wape_pct, 1)}
                unit="%"
                detail={`${data.metrics.paired_hours}/${data.metrics.expected_hours} paired hours · ${number(data.metrics.coverage_pct)}% coverage`}
              />
            </div>
            <div className="insight-strip">
              <div className="insight-icon">
                <Info size={20} />
              </div>
              <div>
                <strong>
                  {data.metrics.shortfall_hours} of {data.metrics.paired_hours}{" "}
                  paired hours had less wind than forecast.
                </strong>
                <p>
                  Gross wind shortfall:{" "}
                  {number((data.metrics.shortfall_mwh ?? 0) / 1000, 1)} GWh ·
                  gross surplus:{" "}
                  {number((data.metrics.surplus_mwh ?? 0) / 1000, 1)} GWh. These
                  are wind deviations, not the utility’s actual purchases.
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => dispatch({ type: "view", value: "method" })}
              >
                Read the method
                <ArrowUpRight size={15} />
              </button>
            </div>
            <Heatmap
              overview={data}
              select={(date, hour) =>
                dispatch(
                  hour === undefined
                    ? { type: "date", value: date }
                    : { type: "interval", date, hour },
                )
              }
            />
            <ErrorBoundary label="The accuracy charts could not open">
              <Suspense fallback={<Loading />}>
                <AccuracyCharts overview={data} />
              </Suspense>
            </ErrorBoundary>
            <div className="method-strip">
              <ShieldCheck size={17} />
              <p>
                Each hour uses a forecast published strictly before that day’s
                cutoff. The same rule is applied to every decision. Missing data
                stays missing; there is no interpolation or zero-filling.
              </p>
            </div>
          </>
        )
      )}
    </>
  );
}

function Method() {
  const query = useApi<Provenance>("/api/v1/provenance");
  const [sources, setSources] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BUILT TO BE QUESTIONED</p>
          <h1>
            Every number has a source<span>.</span>
          </h1>
          <p>The assumptions, data lineage, and limits behind this pilot.</p>
        </div>
        <a className="button" href="/api/docs" target="_blank" rel="noreferrer">
          API reference
          <ExternalLink size={15} />
        </a>
      </div>
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={query.retry} />
      ) : (
        query.data && (
          <>
            <div className="source-banner">
              <span className="source-logo">
                <Database size={28} />
              </span>
              <div>
                <p className="eyebrow">ONE SOURCE. TWO DATASETS.</p>
                <h2>Elexon Insights Solution</h2>
                <p>
                  Real historical data · snapshot retrieved{" "}
                  {timestampLabel(query.data.retrieved_at)} GMT
                </p>
              </div>
              <span className="status">
                <ShieldCheck size={13} />
                SHA-256 verified on load
              </span>
            </div>
            <div className="two-columns method-cards">
              <section className="panel">
                <p className="eyebrow">01 · TIME & SCOPE</p>
                <h2>Replay the decision, not the latest revision.</h2>
                <p>
                  Purchase decision dates are 1–31 January 2026 in Europe/London
                  (GMT). Each buys for the next calendar day, so delivery dates
                  run from 2 January to 1 February.
                </p>
                <p>
                  The default 09:00 cutoff gives an illustrative 20-minute
                  preparation window before the EPEX GB hourly auction’s 09:20
                  closure. The cutoff is configurable; the client’s actual
                  trading workflow still needs confirmation.
                </p>
                <a
                  className="source-link"
                  href="https://www.epexspot.com/sites/default/files/2024-09/Trading%20Brochure%202024%20August.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  EPEX trading timetable
                  <ExternalLink size={13} />
                </a>
              </section>
              <section className="panel">
                <p className="eyebrow">02 · FORECAST SELECTION</p>
                <h2>The last eligible forecast for each hour.</h2>
                <code className="formula">
                  max(publishTime) where publishTime &lt; cutoff
                </code>
                <p>
                  WINDFOR preserves the publication time for each target hour. A
                  publication at the exact cutoff is excluded. Different hours
                  may use different vintages; publication history makes that
                  visible.
                </p>
                <p>
                  January’s records are hourly. No half-hourly forecasts are
                  invented. A selected forecast older than eight hours is
                  flagged as stale.
                </p>
              </section>
              <section className="panel">
                <p className="eyebrow">03 · ALIGNMENT & ERRORS</p>
                <h2>Compare like with like.</h2>
                <code className="formula">
                  actual_hour = (actual_00 + actual_30) / 2
                </code>
                <p>
                  Only FUELHH records with fuelType WIND are used. Both
                  half-hours must exist. Actuals use the latest downloaded
                  publication and are retrospective.
                </p>
                <div className="definition-list">
                  <p>
                    <strong>Error / bias</strong>
                    <span>Forecast − actual; bias is its mean</span>
                  </p>
                  <p>
                    <strong>MAE</strong>
                    <span>Mean absolute hourly error in MW</span>
                  </p>
                  <p>
                    <strong>RMSE</strong>
                    <span>Square root of mean squared error</span>
                  </p>
                  <p>
                    <strong>WAPE</strong>
                    <span>Σ|error| / Σactual × 100; undefined at zero</span>
                  </p>
                  <p>
                    <strong>Energy</strong>
                    <span>Hourly average MW × 1 hour = MWh</span>
                  </p>
                </div>
              </section>
              <section className="panel">
                <p className="eyebrow">04 · UNCERTAINTY & LIMITS</p>
                <h2>A useful reference, with honest limits.</h2>
                <p>
                  The past-error range uses the 10th and 90th percentiles of
                  errors from earlier January decisions, only when the actual
                  publications precede the current cutoff. It needs at least 48
                  observed hours.
                </p>
                <p>
                  This small, correlated sample is not a calibrated confidence
                  interval. Full-month metrics are retrospective; they are never
                  used to construct the decision-day reference.
                </p>
                <p>
                  The data describes GB metered wind represented by Elexon, not
                  all UK renewables. Without demand, contracts, other supply and
                  prices, we cannot calculate portfolio procurement, thermal
                  dispatch or monetary savings.
                </p>
              </section>
            </div>
            <section className="panel provenance-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">REPRODUCIBLE BY DESIGN</p>
                  <h2>Snapshot provenance</h2>
                </div>
                <a
                  className="text-button"
                  href="/api/v1/provenance"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open manifest
                  <ExternalLink size={14} />
                </a>
              </div>
              {Object.entries(query.data.files).map(([filename, file]) => (
                <div className="file-row" key={filename}>
                  <Database size={17} />
                  <div>
                    <strong>{filename}</strong>
                    <code>{file.sha256}</code>
                  </div>
                  <span>{number(file.rows)} records</span>
                  <span>{number(file.bytes / 1024, 1)} KB</span>
                </div>
              ))}
              <p className="panel-note">
                The application reads this bundled snapshot and verifies file
                hashes and record counts. It does not silently switch to
                synthetic data or make live API calls.
              </p>
              <p className="panel-note" data-testid="upstream-verification">
                {query.data.upstream_verification.status === "match" &&
                query.data.upstream_verification.checked_at ? (
                  <>
                    <strong>Official API comparison passed.</strong>{" "}
                    {number(
                      query.data.upstream_verification.matched_records ?? 0,
                    )}{" "}
                    records matched fresh Elexon responses across{" "}
                    {query.data.upstream_verification.requests_checked} requests
                    on{" "}
                    {timestampLabel(
                      query.data.upstream_verification.checked_at,
                    )}{" "}
                    GMT. This is a recorded source check, not a continuous live
                    feed.
                  </>
                ) : query.data.upstream_verification.status ===
                  "differences" ? (
                  <>
                    <strong>
                      The latest source comparison found differences.
                    </strong>{" "}
                    This view still uses the bundled snapshot. Review the
                    verification report and investigate the differences before
                    refreshing the analysis.
                  </>
                ) : query.data.upstream_verification.status ===
                  "unavailable" ? (
                  <>
                    <strong>
                      The latest source comparison could not complete.
                    </strong>{" "}
                    This view still uses the bundled snapshot. Retry the source
                    verification command when Elexon is available.
                  </>
                ) : (
                  <>
                    <strong>No current upstream comparison is recorded.</strong>{" "}
                    Snapshot integrity is checked locally; an operator must run
                    the source verification command to confirm it against
                    Elexon.
                  </>
                )}
              </p>
              <button
                className="text-button"
                onClick={() => setSources(!sources)}
              >
                {sources ? "Hide" : "Show"} all {query.data.requests.length}{" "}
                upstream requests
                <ChevronRight size={14} />
              </button>
              {sources && (
                <ul className="request-list">
                  {query.data.requests.map((row) => (
                    <li key={row.url}>
                      <a href={row.url} target="_blank" rel="noreferrer">
                        {decodeURIComponent(row.url.split("/datasets/")[1])}
                      </a>
                      <span>{row.rows} records</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="attribution">
              <p>{query.data.attribution}</p>
              <a href={query.data.licence} target="_blank" rel="noreferrer">
                Elexon Public Data Licence
                <ExternalLink size={12} />
              </a>
              <a
                href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"
                target="_blank"
                rel="noreferrer"
              >
                WINDFOR documentation
                <ExternalLink size={12} />
              </a>
              <a
                href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream"
                target="_blank"
                rel="noreferrer"
              >
                FUELHH documentation
                <ExternalLink size={12} />
              </a>
            </div>
          </>
        )
      )}
    </>
  );
}

function AccountActions({
  theme,
  setTheme,
  user,
  open,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  user: User | null;
  open: (mode: AccountMode) => void;
}) {
  return (
    <div className="account-actions">
      <button
        className="icon-button theme-toggle"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label={
          theme === "light" ? "Switch to night mode" : "Switch to day mode"
        }
        aria-pressed={theme === "dark"}
        title={theme === "light" ? "Night mode" : "Day mode"}
      >
        {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      {user ? (
        <button
          className="button account-button"
          onClick={() => open("account")}
          aria-label="Open your account"
        >
          <UserRound size={16} />
          <span>{user.name.split(" ")[0]}</span>
        </button>
      ) : (
        <>
          <button className="login-link" onClick={() => open("login")}>
            Log in
          </button>
          <button
            className="button primary signup-button"
            onClick={() => open("signup")}
          >
            Sign up <ArrowUpRight size={14} />
          </button>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState);
  const guard = useNavigationGuard();
  const dispatch: React.Dispatch<Action> = (action) => {
    const next = reducer(state, action);
    if (
      state.view === "workspace" &&
      next.view !== "workspace" &&
      !guard.confirmLeave()
    )
      return;
    rawDispatch(action);
  };
  const [mobileMenu, setMobileMenu] = useState(false);
  const [theme, setTheme] = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [accountMode, setAccountMode] = useState<AccountMode | null>(null);
  const [notice, setNotice] = useState("");
  const historyReady = useRef(false);
  const historyIndex = useRef(0);
  const restoringHistory = useRef(false);
  const memory = useWorkspaceMemory(user);
  useEffect(() => {
    document.documentElement.dataset.accent = memory.data.accent;
    try {
      localStorage.setItem("winddesk-accent", memory.data.accent);
    } catch {}
  }, [memory.data.accent]);
  useEffect(() => {
    if (
      state.view === "desk" &&
      (memory.data.recent?.date !== state.date ||
        memory.data.recent?.cutoff !== state.cutoff)
    )
      memory.update({
        ...memory.data,
        recent: { date: state.date, cutoff: state.cutoff },
      });
  }, [state.view, state.date, state.cutoff, user?.id]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((result) => {
        if (!controller.signal.aborted) setUser(result.user ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const params = new URLSearchParams({
      view: state.view,
      date: state.date,
      cutoff: state.cutoff,
    });
    if (state.hour !== null) params.set("hour", String(state.hour));
    if (!historyReady.current) {
      historyIndex.current = window.history.state?.winddeskIndex ?? 0;
      window.history.replaceState(
        { winddeskIndex: historyIndex.current },
        "",
        `?${params}`,
      );
      historyReady.current = true;
    } else if (window.location.search !== `?${params}`) {
      window.history.pushState(
        { winddeskIndex: ++historyIndex.current },
        "",
        `?${params}`,
      );
    }
  }, [state]);
  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      if (restoringHistory.current) {
        restoringHistory.current = false;
        return;
      }
      const target = event.state?.winddeskIndex ?? historyIndex.current;
      if (!guard.confirmLeave()) {
        const delta = historyIndex.current - target;
        if (delta) {
          restoringHistory.current = true;
          window.history.go(delta);
        }
        return;
      }
      historyIndex.current = target;
      rawDispatch({ type: "restore", value: initialState() });
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [guard]);
  useEffect(() => {
    if (!mobileMenu) return;
    const originalOverflow = document.body.style.overflow;
    const trigger = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    document.querySelector<HTMLButtonElement>(".mobile-close")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", close);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [mobileMenu]);
  const navigate = useCallback(
    (view: View) => {
      setMobileMenu(false);
      if (
        state.view === "workspace" &&
        view !== "workspace" &&
        !guard.confirmLeave()
      )
        return;
      rawDispatch({ type: "view", value: view });
      window.scrollTo({ top: 0 });
    },
    [guard, state.view],
  );
  const openAccount = useCallback(
    (mode: AccountMode) => {
      if (guard.confirmLeave()) setAccountMode(mode);
    },
    [guard],
  );
  const signup = useCallback(
    () => (user ? navigate("workspace") : openAccount("signup")),
    [user, navigate, openAccount],
  );
  const applyPreferences = (current: User) => {
    setUser(current);
    setTheme(current.theme);
    dispatch({ type: "cutoff", value: current.default_cutoff });
  };
  return (
    <div className={state.view === "home" ? "site-shell" : "app-shell"}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {state.view === "home" ? (
        <>
          <header className="site-header">
            <a className="brand" href="?view=home" aria-label="WindDesk home">
              <span className="brand-icon">
                <Wind size={25} strokeWidth={1.8} />
              </span>
              winddesk<span className="brand-period">.</span>
            </a>
            <nav aria-label="Website navigation">
              <a href="#product">Product</a>
              <a href="#workflow">How it works</a>
              <a href="#data">Our data</a>
              <a href="#questions">Questions</a>
            </nav>
            <AccountActions
              theme={theme}
              setTheme={setTheme}
              user={user}
              open={openAccount}
            />
          </header>
          <main id="main" className="home-main" tabIndex={-1}>
            <Home navigate={navigate} signup={signup} signedIn={!!user} />
          </main>
        </>
      ) : (
        <>
          <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
            <a
              className="brand"
              href="?view=home"
              aria-label="WindDesk home"
              onClick={(event) => {
                event.preventDefault();
                navigate("home");
              }}
            >
              <span className="brand-icon">
                <Wind size={25} strokeWidth={1.7} />
              </span>
              winddesk<span className="brand-period">.</span>
            </a>
            <button
              className="mobile-close icon-button"
              aria-label="Close navigation"
              onClick={() => setMobileMenu(false)}
            >
              <X size={20} />
            </button>
            <div className="workspace-label">
              <span className="workspace-icon">GB</span>
              <div>
                National wind pilot<small>Great Britain · Elexon</small>
              </div>
            </div>
            <p className="nav-label">WORKSPACE</p>
            <nav aria-label="Main navigation">
              {(
                [
                  { view: "workspace", label: "My workspace", icon: UserRound },
                  {
                    view: "desk",
                    label: "Decision desk",
                    icon: LayoutDashboard,
                  },
                  {
                    view: "accuracy",
                    label: "Forecast accuracy",
                    icon: ChartColumn,
                  },
                  { view: "method", label: "Data & method", icon: Database },
                ] as const
              ).map((item) => (
                <button
                  key={item.view}
                  className={`nav-item ${state.view === item.view ? "active" : ""}`}
                  aria-current={state.view === item.view ? "page" : undefined}
                  onClick={() => navigate(item.view)}
                >
                  <item.icon size={18} strokeWidth={1.6} />
                  {item.label}
                  {state.view === item.view && <span className="nav-dot" />}
                </button>
              ))}
            </nav>
            <button
              className="nav-item overview-nav"
              onClick={() => navigate("home")}
            >
              <ArrowUpRight size={17} /> Product overview
            </button>
            <div className="sidebar-bottom">
              <button
                className="pilot-card"
                onClick={() => navigate("method")}
                aria-label="Explore the January 2026 pilot data and method"
              >
                <span className="pilot-icon">
                  <Wind size={22} />
                </span>
                <p>
                  A clearer view of
                  <br />
                  tomorrow’s wind.
                </p>
                <span>
                  January 2026 pilot
                  <ArrowUpRight size={14} />
                </span>
              </button>
              <div className="sidebar-footer">
                <span className="avatar">
                  {user?.name.slice(0, 1).toUpperCase() ?? "W"}
                </span>
                <div>
                  {user?.name ?? "Public pilot"}
                  <small>
                    {user ? "Personal workspace" : "Historical decision replay"}
                  </small>
                </div>
                <span className="workspace-online" />
              </div>
            </div>
          </aside>
          {mobileMenu && (
            <button
              className="mobile-overlay"
              aria-label="Close navigation overlay"
              onClick={() => setMobileMenu(false)}
            />
          )}
          <div className="main-shell">
            <header className="topbar">
              <div className="breadcrumb">
                <button
                  className="icon-button mobile-menu"
                  aria-label="Open navigation"
                  onClick={() => setMobileMenu(true)}
                >
                  <Menu size={21} />
                </button>
                <span>Workspace</span>
                <ChevronRight size={13} />
                <strong>
                  {state.view === "desk"
                    ? "Decision desk"
                    : state.view === "workspace"
                      ? "My workspace"
                      : state.view === "accuracy"
                        ? "Forecast accuracy"
                        : "Data & method"}
                </strong>
              </div>
              <div className="topbar-right">
                <span className="historical-badge">
                  <i className="live-dot" />
                  Historical pilot
                </span>
                <AccountActions
                  theme={theme}
                  setTheme={setTheme}
                  user={user}
                  open={openAccount}
                />
              </div>
            </header>
            <main id="main" tabIndex={-1}>
              {state.view === "desk" ? (
                <Desk
                  state={state}
                  dispatch={dispatch}
                  saved={memory.data.saved.some(
                    (item) =>
                      item.date === state.date && item.cutoff === state.cutoff,
                  )}
                  saveDecision={() => {
                    const exists = memory.data.saved.some(
                      (item) =>
                        item.date === state.date &&
                        item.cutoff === state.cutoff,
                    );
                    if (exists) {
                      memory.remove(
                        memory.data.saved.find(
                          (item) =>
                            item.date === state.date &&
                            item.cutoff === state.cutoff,
                        )!,
                      );
                      setNotice("");
                      return;
                    }
                    memory.update({
                      ...memory.data,
                      saved: exists
                        ? memory.data.saved.filter(
                            (item) =>
                              item.date !== state.date ||
                              item.cutoff !== state.cutoff,
                          )
                        : [
                            {
                              date: state.date,
                              cutoff: state.cutoff,
                              note: "",
                            },
                            ...memory.data.saved,
                          ],
                    });
                    setNotice(
                      exists
                        ? "Decision removed from your saved list."
                        : "Decision saved. Add a note in My workspace.",
                    );
                  }}
                />
              ) : state.view === "workspace" ? (
                <Workspace
                  key={user?.id ?? "guest"}
                  user={user}
                  memory={memory.data}
                  update={memory.update}
                  theme={theme}
                  setTheme={setTheme}
                  openAccount={() => openAccount(user ? "account" : "login")}
                  removeDecision={(item) => {
                    memory.remove(item);
                    setNotice("");
                  }}
                  navigate={navigate}
                  openDecision={(date, cutoff) => {
                    dispatch({
                      type: "restore",
                      value: { date, cutoff, view: "desk", hour: null },
                    });
                    setMobileMenu(false);
                    window.scrollTo({ top: 0 });
                  }}
                />
              ) : state.view === "accuracy" ? (
                <Accuracy state={state} dispatch={dispatch} />
              ) : (
                <Method />
              )}
            </main>
            <footer className="main-footer">
              <span>
                <Wind size={15} />
                WindDesk <span className="footer-separator">/</span> Day-ahead
                wind intelligence
              </span>
              <span>
                Contains BSC information licensed under the Elexon Public Data
                Licence.
              </span>
            </footer>
          </div>
        </>
      )}
      {notice && (
        <div className="account-notice" role="status">
          <Check size={17} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {memory.removed && (
        <div className="account-notice undo-notice" role="status">
          <span>
            Removed{" "}
            {dateLabel(memory.removed.item.date, {
              day: "numeric",
              month: "short",
            })}{" "}
            · {memory.removed.item.cutoff} decision.
          </span>
          <button className="text-button" onClick={memory.undo}>
            Undo removal
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss undo removal"
            onClick={memory.dismissUndo}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {accountMode && (
        <ErrorBoundary label="The account panel could not open">
          <Suspense
            fallback={
              <div className="account-notice" role="status">
                Loading account panel…
              </div>
            }
          >
            <AccountDialog
              mode={accountMode}
              user={user}
              theme={theme}
              changeMode={setAccountMode}
              close={() => setAccountMode(null)}
              authenticated={(current) => {
                applyPreferences(current);
                setAccountMode(null);
                navigate("desk");
                setNotice(
                  `Welcome, ${current.name.split(" ")[0]}. Your workspace is ready.`,
                );
              }}
              signedOut={() => {
                setUser(null);
                setAccountMode(null);
                setNotice("You have been logged out.");
              }}
              preferencesSaved={(current) => {
                applyPreferences(current);
                setNotice("Your workspace preferences have been saved.");
              }}
              userUpdated={(current) => {
                setUser(current);
                setNotice("Your account has been updated.");
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
