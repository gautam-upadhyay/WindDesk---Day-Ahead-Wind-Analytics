# WindDesk

**Day-ahead wind intelligence for a Great Britain utility trading desk.**

Prepared for **REint Full Stack SWE challenge v4 Shared**. See the [requirement-by-requirement alignment](docs/CHALLENGE_ALIGNMENT.md), including the scope assumptions and remaining submission steps.

A React + TypeScript frontend and Python FastAPI backend that replay Elexon wind forecasts exactly as available before January 2026 purchase decisions, then measure their error against actual generation. The bundled, verified historical snapshot makes the pilot reproducible and independent of upstream availability.

**Live application:** not deployed yet; deployment and GitHub publication are intentionally deferred to the next phase. Replace this line with the verified public Vercel URL before submission. No external accounts, tokens, or API keys are needed to run locally.

## Run it

### Docker (recommended)

Prerequisite: Docker Desktop with Linux containers, or Docker Engine with Compose.

```sh
docker compose up --build
```

Open **http://localhost:8000**. API documentation: **http://localhost:8000/api/docs**. Stop with `docker compose down`. The multi-stage image compiles React, serves it with FastAPI, runs as a non-root user, and includes the data snapshot. Compose uses a read-only filesystem, drops Linux capabilities, and exposes port 8000.

### Windows without Docker

Prerequisites: Python 3.13 and Node.js 22.14 or later in the Node 22 line. From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
```

The script creates an isolated virtual environment, installs locked dependencies, builds the frontend, and serves the application at **http://localhost:8000**. It does not alter the system execution policy. Stop with Ctrl+C. An alternative port is supported: `-Port 8080`.

### macOS / Linux without Docker

```sh
sh scripts/start.sh
```

Uses `python3`, Node.js and npm. To change the port: `PORT=8080 sh scripts/start.sh`.

### Development with hot reload

```sh
python -m venv .venv
# Windows:
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe -m uvicorn backend.app:app --reload
# macOS/Linux equivalents: .venv/bin/python
```

In another terminal:

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. Vite forwards `/api` to FastAPI on port 8000. In production one origin serves both layers; CORS is not opened unnecessarily.

## What the pilot does

- **Decision desk:** choose a January decision date and information cutoff, inspect next-day hourly wind forecasts, publication timestamps, age and lead time. Actuals stay hidden until explicitly revealed.
- **Historical reference:** optionally display a past-error range and P90 wind shortfall reference, using only earlier January decisions whose actual publications precede the current cutoff. At least 48 observable hours are required. This is an empirical reference, not a calibrated prediction interval or an order recommendation.
- **Forecast accuracy:** MAE, RMSE, signed bias, WAPE, coverage, gross wind shortfall/surplus, daily error, hourly error profile, error distribution, and a clickable 31 × 24 error heatmap.
- **Cutoff comparison:** compare all four information cutoffs side by side, with delivery-day forecast energy and January-wide errors. Select a heatmap cell to replay its exact delivery hour, publication and highlighted table row.
- **Auditability:** publication history distinguishes selected, earlier, and ineligible later vintages. CSV exports include both publication timestamps. Provenance exposes upstream URLs, record counts, and SHA-256 checksums.
- **Usability:** responsive layouts, loading/error/retry states, URL-persisted filters, cancelled obsolete requests, keyboard controls and table alternatives to charts.
- **Product overview:** Jimo-led presentation with real-data product previews, complete capabilities, workflow, data lineage and FAQs, supported by Meteomatics and AleaSoft design influences.
- **Day/night modes:** system-aware initial appearance, persistent browser preference and themed charts, tables, controls and forms.
- **Accounts:** working signup, login, session restoration, logout and saved appearance/default-cutoff preferences. The public pilot stays open without login.
- **My workspace:** saved decision dates/cutoffs, notes, resume-last-decision and Ocean/Mint/Violet accents, stored separately for each browser account. Profile names and passwords can be updated from the account panel.
- **Recovery:** unsaved-note navigation warnings, Undo removal, request timeouts and chart/component failure boundaries. See [optimization details and measurement commands](docs/OPTIMIZATIONS.md).

## Accounts and persistence

Create your own account with **Sign up**; no default credentials are bundled. Local startup stores accounts in ignored `.local/` storage. Docker Compose retains accounts in a named volume while the remaining filesystem stays read-only. Passwords are salted/hashed, sessions use HttpOnly cookies, and account responses are private/no-store.

**Hosted Vercel accounts require persistent PostgreSQL through `DATABASE_URL`.** Set that URL and `AUTH_COOKIE_SECURE=true` in Vercel before verifying production signup/login. Guest access to public analysis has no account-database dependency. See [UI and account setup](docs/UI_AND_ACCOUNTS.md) for the design references, configuration and scope.

## Domain decisions that matter

1. **Decision month, not delivery month.** The brief specifies purchase decisions made in January. Decision dates 1–31 January therefore correspond to delivery dates **2 January–1 February 2026**. A 1 January delivery would require a December decision and is outside the selected cohort.
2. **Great Britain scope.** The brief calls the client UK-based, but these Elexon aggregates represent GB metered wind; they do not represent all UK wind, Northern Ireland, embedded renewables, or a utility's portfolio entitlement.
3. **Use publication time, not hindsight.** For each target hour, take the maximum `publishTime` strictly **before** the selected decision cutoff. A publication exactly at cutoff is excluded conservatively. Selection is per target, so partial vintages can fall back to older records. Never use an endpoint returning only the final/latest historical forecast.
4. **Check real resolution.** The downloaded January WINDFOR observations are hourly, despite the brief's implied half-hourly alignment. FUELHH is half-hourly. We average its two half-hour MW values to compare with the hourly forecast. Both halves must be present; no forward fill, interpolation or zero replacement is applied. A schema/resolution change fails validation instead of silently changing the analysis.
5. **Cutoff is an assumption.** Default **09:00 Europe/London** provides an illustrative preparation window before the EPEX GB hourly 09:20 auction closure. Presets also include 09:20, 15:00 and 15:30. The later cutoffs explore the afternoon auction workflow; they do not improve the information available for the morning auction. Times are GMT throughout this January-only product. Confirm the client's exchange and operational deadline before production.
6. **Actuals are retrospective.** Use the latest downloaded FUELHH publication per half-hour. Reveal actuals explicitly; they are not available to the historical purchase decision. The uncertainty reference excludes actual records with publication timestamps at or after the decision cutoff.
7. **Wind error is not procurement.** The app quantifies national wind deviations. Demand, contracted supply, other generation, prices, curtailment and portfolio exposure are unavailable. It cannot determine a utility's complete residual requirement, thermal dispatch, financial savings or optimal bid. Differences may include population/measurement and curtailment effects; the comparison does not establish error causality.

## Quantitative definitions

For matched delivery hour `h`, `error_h = forecast_h − actual_h` in MW. Positive error means overestimated wind and therefore a wind shortfall relative to the forecast.

| Measure | Definition |
| --- | --- |
| MAE | `mean(abs(error))`, MW |
| RMSE | `sqrt(mean(error²))`, MW; penalizes larger misses |
| Bias | `mean(error)`, MW; signed |
| WAPE | `sum(abs(error)) / sum(actual) × 100`; null if denominator is zero |
| P90 absolute error | Linear-interpolated 90th percentile of absolute errors |
| Coverage | Matched hours / expected hours; metric denominators exclude missing pairs |
| Forecast / actual energy | Sum of available hourly average MW × 1 hour, MWh; shown alongside coverage |
| Gross shortfall / surplus | Sum of positive / negative-part hourly errors × 1 hour, MWh; opposite signs do not cancel |
| Past-error range | `max(0, forecast − q90(error))` to `max(0, forecast − q10(error))` using earlier observable errors |

No MAPE is shown because near-zero wind makes it unstable. We report WAPE with its denominator rule instead. The past-error sample contains correlated hours from one month; it is neither independent evidence of 80% future coverage nor a risk model for an individual portfolio.

At **09:00 GMT**, the included snapshot gives **744/744 paired hours**, MAE **2,038.91 MW**, RMSE **2,504.76 MW**, bias **+1,747.89 MW**, WAPE **18.07%**, and **632** hours of wind shortfall. See [the analysis](docs/ANALYSIS.md) for interpretation and cutoff comparison.

## Repository map

```text
backend/
  domain.py          Validated records, point-in-time selection, alignment, metrics
  app.py             Versioned FastAPI routes, CSV, logging, health, static serving
  schemas.py         Explicit response contracts for the typed API
  provenance.py      Binds upstream verification claims to the current snapshot
  auth.py            Persistent accounts, password hashing, sessions and preferences
api/index.py         Vercel ASGI entrypoint using the same FastAPI app
src/
  App.tsx            Decision desk, accuracy, provenance, accessible controls
  Home.tsx           Landing page, real-data previews, capabilities and FAQs
  Account.tsx        On-demand signup/login/profile and session client
  theme.ts           Lightweight appearance hook
  CutoffComparison.tsx  On-demand four-cutoff comparison with cohort checks
  ErrorBoundary.tsx  Rendering/bundle failure recovery
  NavigationGuard.tsx  Unsaved-note navigation guard
  performance.ts     Opt-in local Web Vitals instrumentation
  Workspace.tsx      Personal saved decisions, notes, resume and accent settings
  workspace.css      Personal workspace, charcoal palette and field focus states
  experience.css    Shared day/night design, public site and account UI
  Charts.tsx         Lazy-loaded Recharts visualizations
  api.ts             Abortable fetch hook with loading, error and retry state
  types.ts           Frontend data contracts
  format.ts          Consistent units and London time formatting
  styles.css         Responsive visual system and print styles
data/
  forecasts.json.gz  17,864 original WINDFOR records, compressed
  actuals.json.gz    1,488 original FUELHH WIND half-hours, compressed
  manifest.json      Retrieval time, 64 source requests and checksums
  upstream-verification.json  Full fresh-API comparison evidence
scripts/
  ingest.py          Bounded-concurrency Elexon ingestion, retries, validation
  verify_upstream.py Independent full-record comparison with the official APIs
  start.ps1          Windows installation/build/start workflow
  start.sh           macOS/Linux installation/build/start workflow
  smoke.py           Unauthenticated local/deployed endpoint checks
  package.py         Source-only handoff ZIP generator
  performance.mjs    Repeatable desktop/throttled-mobile lab measurements
tests/               Python domain and API tests, including independent raw-data oracle
e2e/                 Desktop/mobile browser integration and accessibility tests
docs/
  ARCHITECTURE.md    Design, API, tradeoffs and production follow-ups
  ANALYSIS.md        Snapshot results and interpretation
  DEMO_SCRIPT.md     Timed customer + technical walkthrough (under ten minutes)
  DEPLOYMENT.md      Vercel, Docker, GitHub and access-verification instructions
  SUBMISSION.md      Final-phase checklist; do not submit without a video
  VERIFICATION.md    Checks actually run and any environment limitations
  CHALLENGE_ALIGNMENT.md  Requirement coverage and explicit submission status
  UI_AND_ACCOUNTS.md Design references, account security and persistence setup
  OPTIMIZATIONS.md   Decision workflow, recovery, performance method and research
  performance-results.json  Recorded local lab samples, not field performance
.github/workflows/ci.yml  Tests, browser flows, build and container smoke check
Dockerfile / compose.yaml   One-container runtime
vercel.json          React static output + Python API rewrites/bundling
requirements*.txt    Python runtime and development dependency inputs/lockfiles
package*.json        Frontend dependency manifest and exact npm lockfile
```

## Verify

```sh
# Windows shown; use .venv/bin/python on macOS/Linux
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe -m pytest
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser tests start the production server automatically when nothing is running on port 8000. To use an already installed Edge instead of downloading Chromium, set `PLAYWRIGHT_CHANNEL=msedge` in your shell. CI installs Chromium, runs all tests, builds the container, and checks `/api/health` and `/`.

If Windows denies access to an old pytest temporary/cache directory (for example after switching between sandbox and regular execution), use fresh project-local scratch directories:

```powershell
New-Item -ItemType Directory -Force -Path .local | Out-Null
$testScratch = Join-Path (Get-Location) ('.local/pytest-' + [guid]::NewGuid().ToString('N'))
.venv\Scripts\python.exe -m pytest --basetemp $testScratch -o "cache_dir=$testScratch-cache"
```

`npm run format:check` verifies the frontend source style. `python scripts/package.py` creates `artifacts/WindDesk-source.zip` without dependencies, generated build output or credentials. Fonts are self-hosted; their Open Font Licences are in `public/fonts/`.

The local extension previously passed **62 Python tests** and **19 additional runs of the account tests against PostgreSQL**. The latest optimization update passed **9 React tests** and **50 distinct desktop/mobile browser checks** across the full run and affected-flow reruns. Docker account/session persistence was checked across container replacement. See [verification evidence](docs/VERIFICATION.md), [optimization research and performance method](docs/OPTIMIZATIONS.md), and the [personal workspace](docs/screenshots/personal-workspace.png), [day](docs/screenshots/home-day.png), [night](docs/screenshots/home-night.png) and [signup](docs/screenshots/account-signup.png) screenshots.

## Refresh the snapshot

Not required to run the app. Fetches only the two permitted Elexon datasets; no other generation, weather, demand or market-price data is used.

```sh
python scripts/ingest.py
```

WINDFOR requests cover 30 December–31 January publication dates, retaining only the cohort's delivery hours and publications before 1 February. The older vintages permit fallback at the earliest January cutoff. Actual requests cover 2 January–1 February settlement dates, restricted to WIND. Four concurrent downloads, per-request timeouts, bounded retries, duplicate-conflict detection, response hashes and atomic file replacement support auditability. Stop/restart the API after refresh to invalidate in-process caches. Refresh intentionally requires a rebuild/redeployment for the hosted immutable pilot. Do not run ingestion inside a public request handler.

## Verify the genuine upstream APIs

The brief links API documentation on `bmrs.elexon.co.uk`; the actual public JSON service is **`https://data.elexon.co.uk/bmrs/api/v1/datasets/`**. Both ingestion and verification call only `WINDFOR/stream` and `FUELHH/stream` (WIND), over HTTPS. No API key is required. The application serves a reproducible historical snapshot downloaded from these APIs, rather than calling Elexon on every page load.

```sh
python scripts/verify_upstream.py
```

This separate online check re-fetches all **64** source requests and compares **every original field** of every in-scope record; timestamp formats are normalized to UTC. It exits nonzero on differences or unavailable upstream responses, saves evidence in `data/upstream-verification.json`, and never alters generation data. Re-run after ingestion and investigate differences before rebuilding. Runtime verification claims are bound to the current data-file hashes, so replacing the snapshot invalidates an older report.

On **25 October 2026 at 21:20 UTC** (26 October in India), the check matched **17,864/17,864 forecast records and 1,488/1,488 actual records**, with zero changed, missing or additional records. This is evidence of the historical snapshot's source at that check time, not a continuous live-data guarantee. The Data & method view displays this result and its timestamp. See [the evidence](data/upstream-verification.json).

## Deploy later

Use the step-by-step [deployment guide](docs/DEPLOYMENT.md). `vercel.json` supports a Vite frontend and `api/index.py` Python function in one project. The Docker image is a separate portable deployment path. No live deployment or public repository has been created in this phase.

## AI assistance disclosure

**OpenAI Codex was used** for domain research, implementation, UI design, documentation and test generation. The application has no LLM dependency, makes no AI inference calls and generates no synthetic generation data. Tests include an independent direct comparison against the original source records. Review the implementation, understand the assumptions and rehearse the technical explanation before presenting it as your work.

Kluster review/dependency tools were not exposed in the authoring environment, so the requested Kluster checks could not be run. This is documented explicitly rather than represented as a passed review.

## Data attribution and references

Contains BSC information licensed under the [Elexon Public Data Licence](https://www.elexon.co.uk/bsc/documents/data/open-data-requests/bsc-public-data-licence/).

- [FUELHH stream documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream)
- [WINDFOR stream documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)
- [Elexon wind forecast description](https://bmrs.elexon.co.uk/api-documentation/endpoint/forecast/generation/wind/latest)
- [Elexon wind generation page: hourly forecast description](https://bmrs.elexon.co.uk/wind-generation)
- [EPEX official trading timetable](https://www.epexspot.com/sites/default/files/2024-09/Trading%20Brochure%202024%20August.pdf)
- [Vercel Python functions](https://vercel.com/docs/functions/runtimes/python)
- [FastAPI container deployment](https://fastapi.tiangolo.com/deployment/docker/)
