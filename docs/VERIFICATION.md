# Verification record

Verified locally on **26–27 October 2026**. This records checks actually executed; cloud deployment and public access have not been verified.

## Passing checks on the final implementation

| Check | Result |
| --- | --- |
| Python domain, API, provenance and SQLite account suite | **62 passed** |
| PostgreSQL account suite | **19 passed** against a disposable PostgreSQL 17 database |
| React component/data-hook suite | **9 passed**, including cache isolation, deferred requests, timeout/late-response recovery and rendering boundaries |
| Desktop/mobile browser suite | **50 distinct checks passed** across the full run and affected-flow reruns; includes 20 day/night accessibility audits, cutoff comparison, exact-hour replay, unsaved-note navigation, Undo, chart-bundle recovery and accounts |
| Account persistence across container replacement | **Passed**: account, password, active session and saved preferences survived recreation; logout and login worked afterward |
| Windows automatic test-server startup | **Passed** separately with a targeted browser test after stopping Docker |
| Independent fresh Elexon API comparison | **19,352 / 19,352 records matched** across 64 official requests; zero differences |
| TypeScript strict check + Vite production build | **Passed** locally and inside the Linux container |
| Frontend formatting check | **Passed** |
| Python dependency consistency (`pip check`) | **No broken requirements** |
| npm advisory audit, production and development packages | **0 known vulnerabilities reported** |
| Docker multi-stage image build | **Passed** with Node 22 and Python 3.13 Linux images |
| `docker compose up --build -d` | **Passed**, service healthy |
| Read-only/non-root container runtime | **Passed**, UID/GID 10001, dropped capabilities, no new privileges |
| Unauthenticated smoke script | **Passed** against the final Compose service: frontend, bundled fonts, readiness, February delivery boundary, 744-hour coverage, CSV, OpenAPI and current source-verification evidence |
| Windows startup script | **PowerShell parser check passed**; equivalent dependency/build/server stages exercised individually |
| Python source compilation | **Passed** for backend, Vercel entrypoint and scripts |

The browser tests used installed Microsoft Edge in headless mode, with desktop and iPhone-sized Chromium contexts. They ran against the exact final application served by Docker Compose. CI is configured to use installed Playwright Chromium on Ubuntu; the remote GitHub Actions run has not occurred because repository publication is deferred.

The final frontend production output is approximately 93.7 KB compressed for the main JavaScript chunk, 112.7 KB for charts and 12.3 KB CSS. Account code (3.6 KB), cutoff comparison (1.6 KB) and opt-in performance instrumentation (3.3 KB) are separate lazy chunks. Fonts are self-hosted and require no third-party runtime requests.

The browser suite covers the product landing page, tabbed real-data previews, FAQ, theme persistence across reload/navigation, all analytical workflows, signup, saved account preferences, session restoration, invalid login, logout and subsequent login. Both SQLite and PostgreSQL tests verify password/session storage, expiry/revocation, validation without credential echo, origin checks, rate limits and secure-cookie configuration. The Docker persistence check recreated the container while retaining its named volume; it verified the same session and preferences afterward.

## Issues discovered and resolved during verification

- Initial accessibility audit found insufficient contrast in secondary text and a scrollable interval table lacking keyboard focus. Text colors were darkened, and the table now exposes a labelled focusable region. All final automated WCAG A/AA checks passed.
- The initial DOM test package required a newer Node release than the local environment. It was replaced with a compatible pinned version; frontend tests and the production build passed.
- A twelve-worker browser run timed out under concurrent local load. The runner now uses two workers; the complete final suite passed against the final container. No assertions were removed or relaxed to hide these failures.
- During local font bundling, the first download response did not contain the expected font subset. The correct files were retrieved, rebuilt and verified both by HTTP signature checks and browser tests. Final runtime font requests succeed.
- The Windows browser-test fallback command used an unquoted Python path. It now uses a quoted absolute path. After the full container browser suite passed, Docker was stopped and a separate browser test verified automatic Python server startup and the provenance page successfully.
- A Python rerun encountered Windows permissions on an existing shared pytest temporary/cache directory. The final run used newly created project-local scratch directories and passed all 43 tests. The README includes that environment-specific workaround; no assertions were removed.
- The first attempt to rebuild the updated container was blocked by an approval-service usage limit. On resumption approval succeeded; Docker Desktop was started, and the final image build, health, non-root runtime, HTTP smoke and browser checks all passed.
- During the redesign's visual review, the existing global navigation direction affected the new header. The header now explicitly uses a horizontal layout; the final desktop and mobile screenshots were inspected. Day/night colors also cover chart axes, tooltips, heatmap and account controls.

## UI and account extension

The requested Jimo/Meteomatics/AleaSoft design mapping and complete content inventory are documented in [UI_AND_ACCOUNTS.md](UI_AND_ACCOUNTS.md). Final screenshots include the day/night home page, mobile home page, signup, decision desk and forecast chart. The full build passed locally and in the Linux image after adding the pinned PostgreSQL driver. Hosted Vercel account behavior still requires an actual configured PostgreSQL service and production deployment; only the local PostgreSQL path has been verified.

One non-fatal upstream warning remains in the Python test suite: the installed Starlette test client deprecates its legacy `httpx` adapter in favour of `httpx2`. All assertions pass. It affects the development test client, not the application's runtime path. npm also reports a deprecated transitive test DOM encoding package; its advisory audit is clean.

## Data evidence

- Original forecast records: **17,864**.
- Original WIND actual half-hours: **1,488**.
- Matched delivery hours: **744 / 744**, at every UI cutoff preset.
- A separate raw-record oracle verifies every selection and actual pairing for **09:00, 09:20, 15:00 and 15:30**, rather than asserting only the production implementation's own output.
- Compressed-file SHA-256 and row counts are checked on runtime load. The manifest contains **64** upstream requests, retrieval time and response hashes.
- `python scripts/verify_upstream.py` independently re-fetched all **64 official Elexon responses** at **25 October 2026, 21:20 UTC** (26 October in India). All **17,864 forecast records and 1,488 actual records** matched every original field after timestamp normalization. No missing, changed or additional in-scope records were found. The complete report is in `data/upstream-verification.json`.
- The Data & method view exposes the recorded source-check time and counts. Tests ensure a report for different data hashes, incomplete comparisons, or missing/corrupt evidence cannot assert current verification. The online comparison is a separate explicit command; offline tests do not claim to re-query Elexon.
- Real UI screenshots are in `docs/screenshots/`.

## Deferred or unavailable checks

- **Vercel:** configuration and Python entrypoint are provided; a real authenticated deployment, platform routing and public production access remain to be verified in the deployment phase.
- **GitHub:** no public repository, remote push or actual CI run yet.
- **Video:** timed customer/technical script prepared; no recording, YouTube upload or playback/access verification yet.
- **Submission form and incognito link verification:** intentionally deferred until real public URLs exist.
- **Kluster:** its review and dependency tools were absent from the available toolset and were not found through integration discovery. No Kluster review was run, and no passed review is claimed. The requested automatic review process can resume when that integration is available.

The disposable PostgreSQL test container was stopped after verification. The local Compose application was left running for the applicant to review; docker compose down stops it while preserving account storage. Built images and the project-local development environment remain available for reuse.

## Focus and personal-workspace refinement

The oversized focus outline reported in the screenshots was replaced with a thin border and compact halo for fields. Keyboard-operated buttons retain a visible focus indicator. Browser assertions confirm the cutoff and email fields no longer receive an external outline. The dark theme now uses charcoal surfaces with user-selectable Ocean, Mint or Violet accents.

My workspace saves and replays exact date/cutoff selections, keeps 400-character notes, resumes the last decision and separates guest/account browser storage. Profile updates persist server-side. Password changes verify the current password, revoke prior sessions and rotate the current cookie; a database transaction also prevents stale credentials from creating a new session after a password change.

The initial browser run passed 32 checks; two new tests navigated away before login completed. Those tests now explicitly await confirmed sign-in, then verify the updated name and separation of guest/account notes. The four affected desktop/mobile workspace flows passed on rerun, covering all 34 distinct checks. No assertions were removed or relaxed.

## UI rollback verification

Restored the preceding rounded Manrope/DM Sans interface at the applicant's request, preserving accounts, saved decisions, notes and profile/password features. The production build and local API smoke checks passed; all 34 desktop/mobile browser checks passed in one run. Screenshots were refreshed from the running Docker application.

## Readability and usability update

Increased small labels and body copy by roughly 2px, enlarged chart ticks and retained the existing visual design. Added saved-decision search/sort, a working pilot-card shortcut, Back/Forward selection history, mobile-menu Escape/focus handling and bounded public-response caching. Hiding actuals now restores chronological interval ordering, preventing a retrospective error sort from remaining in the decision view.

The React suite passed all **6 tests** and the browser suite passed all **38 checks**. A separate layout inspection found a decision-control overflow at 768px; controls now wrap, and both affected desktop/mobile navigation checks passed again. The final inspection found no page overflow in **25 combinations**: all five views at 320, 390, 768, 1024 and 1440px. Formatting, the final Docker production build and API smoke checks passed. Screenshots were refreshed and the decision-desk screenshot was visually inspected. Backend code was unchanged; the earlier Python/PostgreSQL results above were not rerun for this frontend update.

## Decision-workflow optimization update

All nine React tests passed. The first browser run passed 48/50: the Undo test's partial name matched both Undo and Dismiss, so its locator was made exact and both affected cases passed. After focused render/loading improvements, a full run passed 49/50 and exposed a real mobile issue: canceling dirty-note navigation left the drawer over the editor. The drawer now closes before navigation confirmation. All four affected desktop/mobile history and dirty-note tests passed on rerun. No assertions were removed or relaxed; all 50 distinct checks have passed.

The Linux Docker build includes the final source. Formatting and API smoke checks passed. A production npm audit after adding pinned `web-vitals@6.2.3` reported zero known vulnerabilities. Backend/domain code and the Elexon snapshot were unchanged; earlier Python/PostgreSQL and full upstream-verification results were not repeated for this frontend update. GitHub CI now collects a performance artifact but has not run remotely.

The local performance method, raw reports, research and explicit limitations are documented in `docs/OPTIMIZATIONS.md`. Throttled samples are measured evidence, not a production p75 or SLA claim.

After prioritizing chart-overlay rendering, all four affected desktop/mobile overlay and exact-hour replay checks passed, including assertions that the actual-generation line appears and disappears correctly.

The final visual inspection checked **30 layouts**: all five main views plus expanded cutoff comparison at 320, 390, 768, 1024 and 1440px. No page overflow was found. Expanded comparison passed two additional automated accessibility audits, one per theme. Screenshots were refreshed; the dark comparison screenshot was visually inspected.

The final performance report contains **12 measured samples**. Desktop median chart/font readiness was 192ms for home and 511ms for the decision desk. Throttled-mobile median LCP was 2,636ms/2,492ms, INP 304ms/280ms and CLS 0.022/0.002 respectively. Mobile homepage LCP and both mobile INP medians exceed the goals; no all-targets-passed claim is made. See `docs/OPTIMIZATIONS.md` for the method and limitations.

