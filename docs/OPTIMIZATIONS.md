# Decision workflow and performance improvements

This update retains the Elexon-only January decision scope and the existing visual design. Cloud publication remains deferred.

## Decision support

Forecast accuracy has an opt-in comparison of the four information cutoffs. Delivery-day forecast energy relates to the selected decision date; MAE, signed bias and gross wind shortfall cover the entire January cohort. The comparison verifies equality of matched delivery-hour sets before stating comparability. It does not recommend a cutoff or turn wind exposure into a purchase order. Failed comparison requests can be retried independently.

A heatmap date still opens the decision day. An individual cell also selects its exact hour, persists `hour` in the shareable URL, marks the chart and focuses/highlights the matching table row. A detail panel shows the forecast, outcome and selected forecast publication. This route explicitly opens a retrospective lens; ordinary decision links continue to hide actuals by default.

## Responsive loading and failure recovery

The homepage requests monthly analysis only for its accuracy preview. Accounts and comparison code load on demand, and performance instrumentation loads only when explicitly enabled. Preview tab state is isolated from the rest of the marketing page. Stable callbacks and memoized wind charts avoid re-rendering chart internals merely to change CSS theme colors. Reserved metric/chart loading space reduces movement when decision data arrives.

Chart overlay updates use React's deferred rendering so switch feedback and table values can update before the more expensive chart render. A brief Updating chart state makes that transition explicit. Turning an overlay off hides it immediately; the date/cutoff dataset is never deferred across selections.

Public data requests have a 15-second timeout, an abort controller and a guard against late responses. Retry invalidates the selected cache entry. Rendering error boundaries protect charts, account loading and the overall application; a reload action recovers from stale or unavailable JavaScript bundles while the accessible interval table remains usable if a chart fails. Account mutations also have a 15-second browser abort signal. If a mutation times out, the server may already have applied it; check the current account state before retrying.

## Notes and Undo

Draft notes live at workspace level, so filtering a card out of view does not discard its edits. Internal navigation and Back/Forward ask before discarding dirty notes. A native unload listener exists only while notes are dirty, then is removed after saving. Browser unload prompts are best effort, especially on mobile; a crash or forced browser termination is not covered. Notes still require Save note and remain browser-local.

Removing a saved decision offers one-level Undo, including its last saved note and previous list position. Undo is held in memory for the current tab lifetime, scoped to the active guest/account workspace. It does not overwrite a decision that has since been re-added.

## Reproduce performance measurements

With dependencies installed and the production app running:

```sh
node scripts/performance.mjs --runs 3
```

On Windows this uses installed Edge. For a different installed Playwright channel, set `PLAYWRIGHT_CHANNEL`. In CI, installed Playwright Chromium is used. `--base-url` selects an app origin; `--output` selects the report path.

The script uses a fresh browser context and disables browser cache for each sample. It measures the homepage and decision desk on desktop and a 390px mobile viewport, with mobile throttling of 1.6Mbps down, 750Kbps up, 150ms latency and 4x CPU slowdown. It records LCP, INP, CLS, TTFB, time until the forecast chart/fonts are ready, and observed API response times. API timings include the browser and network, not just backend execution.

`docs/performance-results.json` records actual local samples. `docs/performance-before-render-optimization.json` preserves the first run of this feature update, before the focused render/loading-space optimizations. These are small lab samples on one machine, not a controlled production comparison, real-user p75 statistics or an SLA. Missing metric callbacks remain unavailable rather than being reported as zero.

For local inspection, load `/?view=desk&perf=1` and inspect `window.__winddeskMetrics` in developer tools. Instrumentation makes no telemetry requests, stores no account data and persists no measurements. CI is configured to collect a one-run-per-profile report as an artifact; the hosted GitHub Actions workflow has not run yet.

### Recorded final lab results

Twelve samples were recorded on 27 October 2026 India time, three for each profile/view. Values below are local medians.

| Profile / view | Chart and fonts ready | LCP | INP | CLS |
| --- | ---: | ---: | ---: | ---: |
| Desktop / home | 192ms | 120ms | 32ms | 0.023 |
| Desktop / decision desk | 511ms | 108ms | 48ms | 0.007 |
| Throttled mobile / home | 3,281ms | 2,636ms | 304ms | 0.022 |
| Throttled mobile / decision desk | 5,545ms | 2,492ms | 280ms | 0.002 |

These results do **not** establish a passing mobile performance claim: homepage LCP and both mobile INP medians exceed the goals. Initial chart availability also remains slower under throttling. Render isolation, deferred overlay updates and reserved loading space are implemented, but the small before/after samples do not show a uniform INP improvement. Use the reports to guide subsequent profiling rather than claiming a general speedup. Production network latency, device behavior, cold API execution and real-user p75 remain unmeasured.

## Research used

- [React error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) and [lazy loading](https://react.dev/reference/react/lazy): rejected imports need a boundary; reloading is the recovery path for a cached failed lazy import.
- [React deferred values](https://react.dev/reference/react/useDeferredValue): prioritize control feedback while a memoized chart catches up through interruptible rendering.
- [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event): attach listeners only while edits are unsaved; browser lifecycle limitations remain explicit.
- [Google Web Vitals](https://github.com/GoogleChrome/web-vitals): use the official, pinned library to measure lifecycle-aware LCP, INP and CLS rather than inventing an approximate INP metric.
- [Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds): 2.5s LCP, 200ms INP and 0.1 CLS are goals. A local median does not establish a passing production p75.
