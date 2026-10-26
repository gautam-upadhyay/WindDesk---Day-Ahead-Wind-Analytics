# Two-part demo script

Target **9 minutes**: customer pilot 0:00–4:20, technical review 4:20–8:50, leaving ten seconds of margin. Rehearse with your natural speaking pace and keep the final video under ten minutes. Replace test counts if they change; use the included snapshot for the figures below. Recording/upload is deferred to a later phase.

Before recording: run the production app; close unrelated tabs; use a 1440 × 900 desktop browser at normal zoom. Keep the repository open in an editor and terminal. Start at `/?view=desk&date=2026-01-15&cutoff=09%3A00`, with actuals and the reference range off. The exact layout adapts to your screen.

## Part 1 — Customer pilot (maximum five minutes)

### 0:00–0:40 · The customer problem

**Show:** Decision desk, top of page.

“This is WindDesk, a pilot for your day-ahead power purchasing team. The question is simple: before we commit tomorrow's purchases, what wind generation information did we actually have, and how uncertain has that information been?

This pilot uses only Elexon's national wind forecasts and actual generation. It covers purchase decisions made in January 2026. Each decision buys for the next day, so deliveries run from 2 January to 1 February.”

### 0:40–1:40 · Replay one real decision

**Show:** 15 January, 09:00 cutoff. Hover forecast curve, inspect the selected publication, open publication history.

“For 15 January, I have selected a 09:00 information cutoff. Every delivery hour uses its latest forecast published strictly before that moment. Here, the selected vintage is 07:30. Forecast energy is approximately 190.3 gigawatt-hours for tomorrow.

Later publications are visible in the audit trail but cannot enter the decision. I can inspect the exact forecast, timestamp and lead time for every hour, or export the same numbers. Nothing is silently replaced by the final revision.”

### 1:40–2:30 · Make uncertainty visible

**Show:** Enable Past-error range, then Reveal actuals.

“The optional range gives context from earlier errors whose actual observations were available before this decision. Here it uses 320 observable hours across earlier January decisions. The P90 signed shortfall is about 4.33 gigawatts. This is a historical reference from a small, correlated sample, not a calibrated guarantee or an instruction to buy that amount.

Revealing actuals opens an explicitly labelled retrospective lens. We can now inspect how the forecast compared with delivery, while keeping hindsight separate from the decision view.”

### 2:30–3:40 · Quantify the pilot

**Show:** Forecast accuracy; open Compare all four cutoffs, then select a heatmap hour to show its highlighted interval and publication. Keep this within the existing 70-second segment.

“Across all 31 morning decisions we have complete coverage: 744 matched hours. Mean absolute error is 2.04 gigawatts; RMSE is 2.50. Bias is positive 1.75 gigawatts, and weighted absolute error is 18.07 percent. Wind was below forecast in 632 hours.

The heatmap makes the concentration of those misses visible. Selecting an hour replays that exact interval and its publication. The cutoff comparison shows how the four information sets performed on the same matched hours. Later information was unavailable for the morning purchase, so we cannot rewrite that decision using afternoon forecasts.”

### 3:40–4:20 · Pitch and boundaries

**Show:** Data & method, then return to the desk.

“The pilot provides a traceable wind input and a measured uncertainty reference. Its value is that your team can examine what it knew, see the scale and direction of misses, and explain each number.

It does not claim a complete procurement requirement. That needs your demand, contracts, other supply and portfolio exposure. The next pilot step is to validate those inputs and your exact trading deadline, then evaluate the resulting decisions on a longer, unseen period.”

## Part 2 — Technical lead review (maximum five minutes)

### 4:20–5:10 · Architecture and runnable boundary

**Show:** Architecture diagram, repository tree, Dockerfile.

“The frontend is React with TypeScript and lazy-loaded Recharts. FastAPI exposes versioned JSON and CSV endpoints. One Docker image builds React and serves it alongside the Python API. Vercel configuration provides a static frontend and Python function using the same app.

An ingestion script downloads the two permitted sources with bounded concurrency, timeouts and retries. It preserves original records, URLs and checksums. A separate verification command re-fetched all 64 official requests and matched all 19,352 records; Data & method shows when. Runtime verifies the snapshot without depending on upstream availability. The energy analysis stays file-based. Accounts use a separate SQLite volume locally or PostgreSQL on Vercel; no distributed queue is needed.”

### 5:10–6:30 · Walk through correctness

**Show:** `backend/domain.py`: `select`, `day_rows`, `metrics`, `day`.

“Selection uses a target-time index and binary search over publication times. The exclusive boundary prevents leakage at cutoff, and each target can fall back to an earlier publication.

The real January forecasts are hourly, while actuals are half-hourly. We require both actual halves and average their megawatts. Missing data stays null. Error is forecast minus actual: positive means wind shortfall relative to forecast. Energy sums use the one-hour duration, so megawatts become megawatt-hours.

The reference range uses earlier decisions and checks the actual publication timestamp before including an error. Early January shows insufficient history instead of borrowing information from the future. Actual revisions and aggregate scope remain documented limitations.”

### 6:30–7:25 · Interface and API design

**Show:** `src/api.ts`, reducer in `src/App.tsx`, `backend/schemas.py`, `/api/docs`.

“Shared filters live in a reducer and the URL. View-specific controls stay local. The data hook aborts obsolete requests and ignores their late results, so rapid date changes cannot display a stale response. Loading, retry and missing values have explicit states.

The landing page explains each workflow. Day/night mode persists locally; account preferences persist server-side. Signup and login use salted password hashes and HttpOnly sessions with logout revocation. Typed response contracts keep units and nullability visible. Invalid inputs return 422; a missing or corrupt snapshot returns 503. The API returns request IDs and structured timing logs. Same-origin delivery avoids a permissive CORS policy.”

### 7:25–8:15 · Evidence and development practices

**Show:** test files, actual test output, CI workflow.

“SQLite and PostgreSQL tests cover authentication, expiry, revocation, origin checks and rate limits. The forecast tests target the dangerous edges: exact cutoff, revisions, missing halves, zeros, time boundaries and future-actual leakage. A separate raw-data implementation checks every one of the 744 selections at all four cutoffs.

React tests exercise request cancellation and failure states. Desktop and mobile browser tests cover the production build, exports and drill-down. Automated accessibility checks led to contrast and keyboard fixes. CI also builds the Docker image and smoke-tests readiness and the frontend.”

### 8:15–8:50 · Tradeoffs and disclosure

**Show:** README AI disclosure and architecture follow-ups.

“The scope is deliberately a reproducible historical pilot. Production would need durable vintage storage, scheduled ingest, monitoring, portfolio authorization and longer, out-of-sample uncertainty evaluation. Public national data remains accessible anonymously. Optional accounts save theme and cutoff preferences; hosted accounts require persistent PostgreSQL.

I used OpenAI Codex for research, implementation, UI design, tests and documentation, as disclosed in the README. No LLM runs in the application and no wind observations are synthetic. The repository records exactly which checks were run and which deployment steps remain.”

## Recording checklist

- Keep each part below five minutes and the total below ten minutes. Cut pauses and loading waits, not technical qualifications.
- Demonstrate the product before showing source code; do not read the README aloud.
- Verify the visible cutoff matches the figures you cite. Turn off hindsight before describing a purchase-time view.
- Record your own understanding and be ready to explain every tradeoff. Do not claim generated work was unaided.
- Upload as **Unlisted**, verify playback while signed out/incognito, and only then add its link to the final submission.
