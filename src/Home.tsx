import { memo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Clock3,
  Database,
  FileDown,
  History,
  Layers3,
  ShieldCheck,
  Sparkles,
  Wind,
} from "lucide-react";
import type { View, Day, Overview } from "./types";
import { useApi } from "./api";
import { gw, number, timeLabel } from "./format";

const products = [
  {
    label: "See tomorrow",
    detail: "Decision desk",
    icon: Wind,
    color: "blue",
    view: "desk",
    text: "Replay the forecast your desk actually had before the buying deadline.",
  },
  {
    label: "Know the error",
    detail: "Forecast accuracy",
    icon: ChartNoAxesCombined,
    color: "purple",
    view: "accuracy",
    text: "Understand the size, direction and timing of wind forecast misses.",
  },
  {
    label: "Trust the source",
    detail: "Data & method",
    icon: ShieldCheck,
    color: "mint",
    view: "method",
    text: "Follow every number back to an original Elexon publication.",
  },
] as const;

function MiniCurve({ day }: { day: Day }) {
  const values = day.hours.map((row) => row.forecast_mw ?? 0);
  const maximum = Math.max(...values, 1) * 1.15;
  const points = values
    .map(
      (value, index) =>
        `${35 + (index * 650) / 23},${195 - (value / maximum) * 150}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 720 235"
      className="preview-curve"
      role="img"
      aria-label="Real wind forecast for 16 January, selected before 09:00 on 15 January. Open the decision desk for the exact interval values."
    >
      <defs>
        <linearGradient id="preview-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[45, 95, 145, 195].map((y) => (
        <line
          key={y}
          x1="35"
          x2="685"
          y1={y}
          y2={y}
          stroke="var(--border)"
          strokeDasharray="4 6"
        />
      ))}
      <polygon
        points={`35,195 ${points} 685,195`}
        fill="url(#preview-gradient)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {["00:00", "06:00", "12:00", "18:00", "23:00"].map((label, index) => (
        <text
          key={label}
          x={35 + index * 162.5}
          y="223"
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="13"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

function ProductPreview({
  selected,
  navigate,
}: {
  selected: number;
  navigate: (view: View) => void;
}) {
  const day = useApi<Day>(
    "/api/v1/day?decision_date=2026-01-15&cutoff=09:00",
    selected === 0,
  );
  const month = useApi<Overview>(
    "/api/v1/overview?cutoff=09:00",
    selected === 1,
  );
  const product = products[selected];
  return (
    <div className="product-preview">
      <aside className="preview-sidebar">
        <div className="preview-workspace">
          <span>GB</span>
          <div>
            National wind<small>January 2026 pilot</small>
          </div>
        </div>
        {products.map((item, index) => (
          <button
            className={index === selected ? "selected" : ""}
            key={item.view}
            onClick={() => navigate(item.view)}
          >
            <item.icon size={16} />
            {item.detail}
          </button>
        ))}
        <div className="preview-source">
          <span className="live-dot" /> Elexon snapshot
          <small>Reproducible. No synthetic data.</small>
        </div>
      </aside>
      <div className="preview-main">
        <div className="preview-title">
          <div>
            <p className="eyebrow">
              {selected === 0
                ? "15 JAN DECISION → 16 JAN DELIVERY"
                : "JANUARY 2026 · GREAT BRITAIN"}
            </p>
            <h3>
              {selected === 0
                ? "Tomorrow, with more context."
                : selected === 1
                  ? "Make uncertainty measurable."
                  : "Every number has a source."}
            </h3>
          </div>
          <span className="preview-badge">
            <Check size={13} />{" "}
            {selected === 0
              ? "Before 09:00 GMT"
              : selected === 1
                ? "744 paired hours"
                : "Official Elexon APIs"}
          </span>
        </div>
        {selected === 0 ? (
          <>
            {day.data ? (
              <>
                <div className="preview-stats">
                  <div>
                    <small>Forecast energy</small>
                    <strong>
                      {number(day.data.metrics.forecast_energy_mwh / 1000, 1)}{" "}
                      <span>GWh</span>
                    </strong>
                  </div>
                  <div>
                    <small>Selected publication</small>
                    <strong>
                      {day.data.publications_used.length === 1
                        ? timeLabel(day.data.publications_used[0])
                        : "Multiple"}{" "}
                      <span>GMT</span>
                    </strong>
                  </div>
                  <div>
                    <small>Delivery intervals</small>
                    <strong>
                      {day.data.metrics.forecast_hours}
                      <span> / 24 hours</span>
                    </strong>
                  </div>
                </div>
                <MiniCurve day={day.data} />
              </>
            ) : (
              <p className="preview-loading" role="status">
                {day.error
                  ? "Open the decision desk to retry loading the source data."
                  : "Loading the real January wind picture…"}
              </p>
            )}
          </>
        ) : selected === 1 ? (
          <>
            <div className="preview-stats">
              {[
                {
                  label: "Mean absolute error",
                  value: month.data ? gw(month.data.metrics.mae_mw) : "—",
                  unit: "GW",
                },
                {
                  label: "Signed bias",
                  value: month.data
                    ? `${(month.data.metrics.bias_mw ?? 0) > 0 ? "+" : ""}${gw(month.data.metrics.bias_mw)}`
                    : "—",
                  unit: "GW",
                },
                {
                  label: "Paired coverage",
                  value: month.data
                    ? number(month.data.metrics.coverage_pct)
                    : "—",
                  unit: "%",
                },
              ].map((item) => (
                <div key={item.label}>
                  <small>{item.label}</small>
                  <strong>
                    {item.value} <span>{item.unit}</span>
                  </strong>
                </div>
              ))}
            </div>
            <div className="preview-accuracy">
              {month.data?.days.map((day) => (
                <div
                  key={day.decision_date}
                  title={`${day.decision_date}: ${number(day.metrics.mae_mw)} MW MAE`}
                >
                  <i
                    style={{
                      height: `${Math.max(4, ((day.metrics.mae_mw ?? 0) / 6000) * 100)}%`,
                    }}
                  />
                  <span>{day.decision_date.slice(-2)}</span>
                </div>
              ))}
            </div>
            <p className="form-help">
              Retrospective daily MAE · 09:00 cutoff · exact values in Forecast
              accuracy.
            </p>
          </>
        ) : (
          <div className="preview-lineage">
            <div>
              <Database size={24} />
              <h4>WINDFOR</h4>
              <p>
                Original forecasts
                <br />
                with publication times
              </p>
            </div>
            <ArrowRight />
            <div>
              <Layers3 size={24} />
              <h4>Point-in-time selection</h4>
              <p>
                Latest publication
                <br />
                strictly before cutoff
              </p>
            </div>
            <ArrowRight />
            <div>
              <ShieldCheck size={24} />
              <h4>FUELHH · WIND</h4>
              <p>
                Both half-hours
                <br />
                aligned to each hour
              </p>
            </div>
          </div>
        )}
        <button className="preview-open" onClick={() => navigate(product.view)}>
          Open {product.detail.toLowerCase()}
          <ArrowUpRight size={16} />
        </button>
      </div>
    </div>
  );
}

const questions = [
  [
    "What information was available before a decision?",
    "For every next-day delivery hour, WindDesk selects the forecast with the latest publishTime strictly before your chosen cutoff on the decision date. Later revisions stay visible in publication history, but never enter the selected forecast.",
  ],
  [
    "Why is the comparison hourly?",
    "The actual January WINDFOR data is hourly. FUELHH WIND actuals are half-hourly, so the two actual MW readings are averaged for each hour. Both must be present. No half-hourly forecasts are invented.",
  ],
  [
    "Which dates are included?",
    "Purchase decisions from 1–31 January 2026, for deliveries from 2 January to 1 February. All decision times use Europe/London, which is GMT in January. The default 09:00 cutoff is illustrative and configurable.",
  ],
  [
    "Does this calculate how much power I should buy?",
    "It quantifies national wind forecast exposure. A complete procurement quantity also needs your demand, contracts, portfolio share and other supply. Those inputs are outside this Elexon-only pilot.",
  ],
  [
    "Is the past-error range a guaranteed confidence interval?",
    "No. It is an empirical reference using earlier January decisions whose actual publications precede the selected cutoff. It requires at least 48 observable hours and is not a calibrated probability or reserve recommendation.",
  ],
  [
    "Do I need an account to try it?",
    "The public pilot, charts, tables and CSV exports are open. An account saves your preferred appearance and information cutoff. Account sessions use an HttpOnly cookie and expire after seven days.",
  ],
];

function ProductShowcase({ navigate }: { navigate: (view: View) => void }) {
  const [selected, setSelected] = useState(0);
  return (
    <section
      className="home-product"
      id="product"
      aria-label="Explore the WindDesk product"
    >
      <div className="product-tabs" role="tablist" aria-label="Product preview">
        {products.map((product, index) => (
          <button
            id={`product-tab-${index}`}
            role="tab"
            aria-selected={selected === index}
            aria-controls="product-panel"
            tabIndex={selected === index ? 0 : -1}
            key={product.view}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              if (
                ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
                setSelected(next);
                document.getElementById(`product-tab-${next}`)?.focus();
              }
            }}
          >
            <span className={`feature-icon ${product.color}`}>
              <product.icon size={20} />
            </span>
            <strong>{product.label}</strong>
            <small>{product.detail}</small>
          </button>
        ))}
      </div>
      <div
        id="product-panel"
        role="tabpanel"
        aria-labelledby={`product-tab-${selected}`}
      >
        <ProductPreview selected={selected} navigate={navigate} />
      </div>
    </section>
  );
}

function Home({
  navigate,
  signup,
  signedIn = false,
}: {
  navigate: (view: View) => void;
  signup: () => void;
  signedIn?: boolean;
}) {
  return (
    <div className="home-content">
      <section className="home-hero" aria-labelledby="hero-title">
        <div className="hero-grid" aria-hidden="true" />
        <span className="pill-label">
          <Sparkles size={13} /> LESS GUESSWORK. MORE CONTEXT.
        </span>
        <h1 id="hero-title">
          Turn tomorrow’s wind
          <br />
          into <span>clearer decisions.</span>
        </h1>
        <p>
          Know the forecast. Understand the uncertainty.
          <br className="desktop-break" /> A clearer day-ahead view for Great
          Britain’s energy buyers.
        </p>
        <div className="hero-actions">
          <button className="button primary" onClick={() => navigate("desk")}>
            Explore the decision desk <ArrowRight size={17} />
          </button>
          <button className="button" onClick={signup}>
            {signedIn ? "Open your workspace" : "Create your workspace"}{" "}
            <ArrowUpRight size={17} />
          </button>
        </div>
        <span className="hero-caption">
          <ShieldCheck size={14} /> Real Elexon data <i /> January 2026 pilot{" "}
          <i /> No account needed to explore
        </span>
        <a className="hero-scroll" href="#product">
          See the full picture <ArrowDown size={14} />
        </a>
      </section>
      <ProductShowcase navigate={navigate} />
      <section className="home-proof" aria-label="Pilot scope">
        <p>
          ONE NATIONAL WIND PICTURE.
          <br />
          <strong>Every decision, accounted for.</strong>
        </p>
        {[
          { value: "31", label: "January purchase decisions" },
          { value: "744", label: "matched delivery hours" },
          { value: "2", label: "official Elexon datasets" },
          { value: "100%", label: "paired cohort coverage" },
        ].map((item) => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>
      <section className="home-section" id="workflow">
        <div className="section-intro">
          <span className="pill-label">FROM FORECAST TO CONFIDENCE</span>
          <h2>
            A calmer way to
            <br />
            make a complex decision.
          </h2>
          <p>
            A focused workflow that keeps your decision-time information and
            hindsight analysis clear.
          </p>
        </div>
        <div className="workflow-grid">
          {[
            {
              number: "01",
              icon: Clock3,
              title: "Set your decision moment",
              text: "Choose a January decision date and the information cutoff. See the next delivery day, with London time handled explicitly.",
              color: "blue",
            },
            {
              number: "02",
              icon: History,
              title: "Inspect the latest eligible forecast",
              text: "Explore hourly MW, total MWh, publication age and lead time. Open the publication history to see exactly which vintage was used.",
              color: "purple",
            },
            {
              number: "03",
              icon: ChartNoAxesCombined,
              title: "Put the error in perspective",
              text: "Reveal actuals, compare cutoffs and inspect daily misses. Use an optional past-error reference built only from earlier observable outcomes.",
              color: "mint",
            },
          ].map((item) => (
            <article
              className={`workflow-card ${item.color}`}
              key={item.number}
            >
              <div>
                <span>{item.number}</span>
                <item.icon size={24} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <button
                onClick={() =>
                  navigate(item.number === "03" ? "accuracy" : "desk")
                }
              >
                Explore workflow <ArrowUpRight size={15} />
              </button>
            </article>
          ))}
        </div>
      </section>
      <section className="home-section capabilities-section" id="capabilities">
        <div className="section-intro">
          <span className="pill-label">THE WHOLE WORKSPACE</span>
          <h2>More than a forecast curve.</h2>
          <p>
            Everything you need to examine the pilot, from the first question to
            the exported evidence.
          </p>
        </div>
        <div className="capability-grid">
          {[
            {
              icon: Wind,
              title: "Decision desk",
              text: "Date and cutoff controls, next-day forecasts, publication age, lead time, stale flags and optional actuals.",
              view: "desk",
            },
            {
              icon: ChartNoAxesCombined,
              title: "Accuracy that explains itself",
              text: "MAE, RMSE, signed bias, WAPE, P90 absolute error, coverage and gross wind shortfall or surplus.",
              view: "accuracy",
            },
            {
              icon: Layers3,
              title: "Patterns, made visible",
              text: "Daily error charts, delivery-hour profiles, error distribution and a clickable 31 × 24 heatmap.",
              view: "accuracy",
            },
            {
              icon: History,
              title: "Publication history",
              text: "Selected, earlier and ineligible later vintages. See what the desk could have known before the cutoff.",
              view: "desk",
            },
            {
              icon: FileDown,
              title: "Data you can take with you",
              text: "Accessible interval tables and day or month CSV exports, including the original publication timestamps.",
              view: "desk",
            },
            {
              icon: ShieldCheck,
              title: "Sources you can inspect",
              text: "Original records, source URLs, SHA-256 integrity checks, upstream comparison evidence and explicit assumptions.",
              view: "method",
            },
          ].map((item) => (
            <article className="capability-card" key={item.title}>
              <item.icon size={23} />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <button
                aria-label={`Explore ${item.title}`}
                onClick={() => navigate(item.view as View)}
              >
                <ArrowUpRight size={19} />
              </button>
            </article>
          ))}
        </div>
      </section>
      <section className="home-data" id="data">
        <div>
          <span className="pill-label">BUILT ON EVIDENCE</span>
          <h2>
            Real data.
            <br />A visible paper trail.
          </h2>
          <p>
            Two official Elexon streams. Original publication times. A
            reproducible historical snapshot you can independently verify.
          </p>
          <button className="button" onClick={() => navigate("method")}>
            Explore data & method <ArrowRight size={16} />
          </button>
        </div>
        <div className="data-flow">
          <article>
            <span>01 / FORECAST</span>
            <h3>WINDFOR</h3>
            <p>17,864 original forecast records</p>
            <small>Hourly generation · target time · publication time</small>
          </article>
          <div className="data-connector">
            <ArrowDown size={20} />
            <span>Point-in-time selection + hourly alignment</span>
          </div>
          <article>
            <span>02 / ACTUAL</span>
            <h3>FUELHH · WIND</h3>
            <p>1,488 original actual half-hours</p>
            <small>WIND only · both half-hours required</small>
          </article>
          <p className="data-caveat">
            GB metered wind represented by Elexon. This pilot uses no demand,
            price, weather or portfolio dataset.
          </p>
        </div>
      </section>
      <section className="home-section home-faq" id="questions">
        <div className="section-intro">
          <span className="pill-label">GOOD QUESTIONS. CLEAR ANSWERS.</span>
          <h2>
            A little context
            <br />
            goes a long way.
          </h2>
          <p>The assumptions behind the analysis are part of the product.</p>
          <button className="text-button" onClick={() => navigate("method")}>
            Read the full methodology <ArrowUpRight size={16} />
          </button>
        </div>
        <div>
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={17} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="home-cta">
        <span className="pill-label">TOMORROW STARTS WITH A CLEARER VIEW</span>
        <h2>
          Make room for
          <br />
          <span>better-informed decisions.</span>
        </h2>
        <div>
          <button className="button primary" onClick={() => navigate("desk")}>
            Open the pilot <ArrowRight size={17} />
          </button>
          <button className="button" onClick={signup}>
            {signedIn ? "Open your workspace" : "Create an account"}{" "}
            <ArrowUpRight size={17} />
          </button>
        </div>
        <p>
          <Check size={14} /> Public demo access · Day and night modes · Your
          saved preferences
        </p>
      </section>
      <footer className="home-footer">
        <div>
          <span className="brand">
            <span className="brand-icon">
              <Wind size={23} />
            </span>
            winddesk<span className="brand-period">.</span>
          </span>
          <p>
            A clearer view of tomorrow’s wind.
            <br />A January 2026 decision-support pilot.
          </p>
        </div>
        <div>
          <h3>Workspace</h3>
          {products.map((item) => (
            <button key={item.view} onClick={() => navigate(item.view)}>
              {item.detail}
            </button>
          ))}
        </div>
        <div>
          <h3>Explore</h3>
          <a href="#workflow">How it works</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#questions">Questions</a>
        </div>
        <div>
          <h3>Data & resources</h3>
          <a href="/api/docs" target="_blank" rel="noreferrer">
            API reference <ArrowUpRight size={12} />
          </a>
          <a href="https://bmrs.elexon.co.uk/" target="_blank" rel="noreferrer">
            Elexon Insights <ArrowUpRight size={12} />
          </a>
          <a
            href="https://www.elexon.co.uk/bsc/documents/data/open-data-requests/bsc-public-data-licence/"
            target="_blank"
            rel="noreferrer"
          >
            Public Data Licence <ArrowUpRight size={12} />
          </a>
        </div>
        <p className="home-footer-bottom">
          Contains BSC information licensed under the Elexon Public Data
          Licence. National wind analysis; portfolio procurement requires
          additional client inputs.
        </p>
      </footer>
    </div>
  );
}

export default memo(Home);
