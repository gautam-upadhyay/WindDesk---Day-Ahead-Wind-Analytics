# REint Full Stack SWE challenge v4 Shared — alignment

WindDesk implements the two requested product capabilities: replay the wind forecast available before each January 2026 purchase decision, and quantify its error against Elexon actual wind generation. This document maps the supplied brief to reviewable evidence. The earlier instruction to defer GitHub publication, deployment, video recording/upload and form submission remains in effect.

## Requirement coverage

| Challenge requirement | Implementation / evidence | Status |
| --- | --- | --- |
| Understand the energy buyer's problem and domain | Decision/delivery separation, configurable information cutoff, explicit GB metered-wind scope; [analysis](ANALYSIS.md), [architecture](ARCHITECTURE.md) | Implemented and documented |
| Latest forecast available when buying day ahead | Per delivery hour, select `max(publishTime)` strictly before the preceding day's cutoff; publication history, age, lead time and CSV | Implemented; raw-record oracle checks all 31 days and four presets |
| Evaluate accuracy quantitatively | MAE, RMSE, signed bias, WAPE, coverage, P90 absolute error, gross shortfall/surplus, daily/hourly breakdowns and error heatmap | Implemented; formula and edge-case tests |
| Use Elexon FUELHH actuals, WIND only | Official `FUELHH/stream` requests with `fuelType=WIND`; original records retained in `data/actuals.json.gz` | 1,488 real half-hours |
| Use Elexon WINDFOR forecasts, including publication time | Official `WINDFOR/stream`, all relevant publication vintages retained in `data/forecasts.json.gz` | 17,864 real records |
| No other data beyond those two datasets | No weather, demand, market-price, other-fuel or third-party generation dataset; EPEX documentation only informs the explicitly illustrative cutoff | Compliant with the data scope |
| Data relevant to purchase decisions in January 2026 | 1–31 January decisions → 2 January–1 February delivery; older publication vintages retained only as candidates for those decisions | Implemented; boundary tests |
| React frontend | React + TypeScript, charts, accessible table alternatives, responsive controls and URL state in `src/` | Implemented |
| Python backend | FastAPI, explicit response contracts, validation, JSON/CSV and health routes in `backend/` | Implemented |
| Docker | Multi-stage, non-root image and hardened Compose runtime | Built and smoke-tested locally |
| Deploy on Vercel or Heroku | `vercel.json`, Python entrypoint, bundling rules and [deployment instructions](DEPLOYMENT.md) | Prepared; actual Vercel deployment deferred, not yet platform-verified |
| Explicit AI-use disclosure | README section “AI assistance disclosure” names OpenAI Codex and its use | Included |
| Customer presentation, max five minutes | First part of [demo script](DEMO_SCRIPT.md): 0:00–4:20 | Script ready; recording deferred |
| Technical review, max five minutes | Second part of script: 4:20–8:50, architecture, code, analysis and practices | Script ready; recording deferred |
| Unlisted YouTube video, maximum ten minutes | Nine-minute recording plan; access checklist in [submission guide](SUBMISSION.md) | Upload and playback verification deferred |
| Public GitHub repo with anonymous/random name | Source package and repository instructions; no company/candidate identifier required in repository name | Publication deferred; do not use the project brand as the final repo name |
| README: file map, startup and hosted app link | File map and Docker/local commands supplied; hosted URL explicitly marked pending | Public app URL must be added after deployment |
| Submit the linked Microsoft form | Required links and final checks documented in `SUBMISSION.md` | Deferred; do not submit without the video |
| Open every submitted URL incognito | Public repo, app and video checks documented | Pending actual public URLs |
| Spend no more than sixteen hours | Energy analysis bounded to a static month; no distributed infrastructure or LLM runtime; optional accounts added at applicant request | Candidate must track total preparation time, including subsequent phases; no unmeasured elapsed-time claim |

## Domain interpretation worth explaining in the review

**Real resolutions take precedence over an inferred one.** FUELHH has 30-minute actuals; the January WINDFOR source contains hourly forecasts. [Elexon's own wind-generation description](https://bmrs.elexon.co.uk/wind-generation) also describes hourly forecasts. For comparison, WindDesk treats the forecast as an hourly MW value and averages the two actual MW readings: `(actual_00 + actual_30) / 2`. Both half-hours must exist. It does not duplicate or interpolate a forecast into synthetic 30-minute observations. All 744 hours are paired in the supplied cohort.

**The decision date is the scope boundary.** A 31 January purchase needs 1 February delivery forecasts and actuals. A 1 January delivery belongs to a December purchase decision. Older forecast publication timestamps are relevant candidates for the first January decision, not extra purchase dates in the analysis.

**There is no specified trading deadline in the brief.** The default 09:00 London cutoff is an illustrative preparation time before the EPEX GB hourly auction closure; it is not asserted to be this client's confirmed process. Other presets and an API `HH:MM` parameter allow different information sets. Exactly-at-cutoff publications are conservatively excluded. Historical publication timestamps establish reported availability; transmission delays cannot be reconstructed from these datasets.

**Wind forecast error is not the entire procurement requirement.** Positive `forecast − actual` indicates less wind than forecast. Demand, contracted supply, portfolio entitlement, prices and other generation are absent by design. Therefore the app reports wind exposure and error rather than fabricating a thermal purchase quantity, financial saving or complete dispatch plan. Actuals are GB metered estimates represented by Elexon, not all UK renewable generation. Differences in populations, operational curtailment and revisions can affect the measured error.

**Decision support and retrospective evaluation are distinct.** Actuals are hidden initially on the decision desk and explicitly revealed for hindsight analysis. Full-month accuracy is retrospective. The optional decision-day error reference uses only earlier January decisions with both actual publications before the cutoff, needs at least 48 observed hours, and is labelled an empirical reference rather than a calibrated prediction interval. Latest downloaded actual revisions cannot reconstruct unavailable historical revisions; this limitation is explicit.

## Evidence that the data is genuine

The brief's `bmrs.elexon.co.uk/api-documentation/...` links describe endpoints; the JSON API host is `data.elexon.co.uk`. `scripts/ingest.py` downloads the original responses, filters the required cohort and preserves original fields. The manifest records request URLs, response hashes, retrieval time, row counts and compressed-file checksums.

An independent `python scripts/verify_upstream.py` run re-fetched **all 64 official requests** on **25 October 2026, 21:20 UTC**. Every in-scope source record matched: **17,864 WINDFOR + 1,488 FUELHH WIND = 19,352 records**, zero missing/new/changed records. See [`data/upstream-verification.json`](../data/upstream-verification.json). The report is bound to both data-file hashes. This is a reproducible historical snapshot; refresh and independent comparison are explicit operator commands, not hidden runtime calls or simulated fallback data.

Spot check for decision **15 January, 09:00**, delivery **16 January, 00:00**:

- Selected WINDFOR: publication **15 January, 07:30 UTC**, generation **7,398 MW**.
- FUELHH WIND: **7,477 MW** at 00:00 and **7,194 MW** at 00:30.
- Aligned actual: **7,335.5 MW**; forecast error: **+62.5 MW**.

## Engineering fit to the role

The implementation demonstrates stateful React interactions, request cancellation, shareable filters, accessible responsive visualization, a typed Python API, point-in-time analysis, tests against an independent raw-data oracle, CI configuration, observability, documentation and portable containers. Distributed orchestration and LLM integration are optional in the job description and are unnecessary for this fixed-month pilot. Their omission keeps the work aligned with the challenge's sixteen-hour scope.

The executable local product and scripts are ready for review. The complete submission is **not yet finished**: publication, hosted verification, recording, unlisted video access and form submission remain the deliberately deferred next phase.

## Requested UI and account extension

The applicant subsequently requested a 60% Jimo / 20% Meteomatics / 20% AleaSoft design influence, full product content, day/night modes and signup/login. The implementation adds a public overview, real-data previews and persistent account preferences. The original Elexon data and analytical rules remain in force. Account storage is separate operational data. See [UI and account setup](UI_AND_ACCOUNTS.md) for the design mapping, authentication and Vercel database configuration.
