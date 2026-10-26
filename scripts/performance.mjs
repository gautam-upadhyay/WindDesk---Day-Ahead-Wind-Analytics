/** Reproducible browser lab samples; these are not field/p75 performance claims. */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const base = new URL(option("--base-url", "http://127.0.0.1:8000"));
if (
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password
)
  throw new Error("Use an HTTP(S) app URL without credentials.");
const runs = Number(option("--runs", "3"));
if (!Number.isInteger(runs) || runs < 1 || runs > 10)
  throw new Error("Use 1–10 runs per profile/view.");
const output = resolve(option("--output", "docs/performance-results.json"));
const percentile = (values, fraction) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
    : null;
};
const profiles = [
  {
    name: "desktop",
    width: 1440,
    height: 1000,
    cpu: 1,
    latency: 0,
    download: -1,
    upload: -1,
  },
  {
    name: "mobile-throttled",
    width: 390,
    height: 844,
    cpu: 4,
    latency: 150,
    download: 1600000 / 8,
    upload: 750000 / 8,
  },
];
const browser = await chromium.launch({
  channel:
    process.env.PLAYWRIGHT_CHANNEL ||
    (process.platform === "win32" ? "msedge" : undefined),
  headless: true,
});
const samples = [];
try {
  for (const profile of profiles)
    for (const view of ["home", "desk"])
      for (let run = 1; run <= runs; run++) {
        const context = await browser.newContext({
          viewport: { width: profile.width, height: profile.height },
          reducedMotion: "reduce",
        });
        try {
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
          await cdp.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: profile.latency,
            downloadThroughput: profile.download,
            uploadThroughput: profile.upload,
          });
          await cdp.send("Emulation.setCPUThrottlingRate", {
            rate: profile.cpu,
          });
          const started = performance.now();
          await page.goto(new URL(`/?view=${view}&perf=1`, base).href, {
            waitUntil: "load",
          });
          await page
            .locator(
              view === "desk"
                ? ".wind-chart .recharts-surface"
                : ".preview-curve",
            )
            .waitFor({ timeout: 60000 });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForFunction(
            () => Boolean(window.__winddeskMetrics),
            undefined,
            { timeout: 15000 },
          );
          const readyMs = performance.now() - started;
          await page
            .getByRole("button", { name: "Switch to night mode" })
            .click();
          if (view === "desk")
            await page.getByRole("switch", { name: "Reveal actuals" }).click();
          else {
            await page.getByRole("tab", { name: "Know the error" }).click();
            await page.waitForFunction(() => {
              const value = document.querySelector(".preview-stats strong");
              return value && !value.textContent?.includes("—");
            });
            await page.getByRole("tab", { name: "Trust the source" }).click();
          }
          // A bounded observation window, then hide the page to flush final metric callbacks.
          await page.waitForTimeout(1000);
          const foreground = await context.newPage();
          await foreground.bringToFront();
          const sample = await page.evaluate(() => ({
            vitals: window.__winddeskMetrics,
            apiResponses: performance
              .getEntriesByType("resource")
              .filter((entry) =>
                new URL(entry.name).pathname.startsWith("/api/v1/"),
              )
              .map((entry) => ({
                path: new URL(entry.name).pathname,
                durationMs: entry.duration,
              })),
          }));
          samples.push({
            profile: profile.name,
            view,
            run,
            readyMs,
            ...sample,
          });
          console.log(
            `${profile.name} ${view} ${run}/${runs}: usable ${Math.round(readyMs)}ms; LCP ${sample.vitals?.LCP?.value ?? "unreported"}ms; INP ${sample.vitals?.INP?.value ?? "unreported"}ms`,
          );
        } finally {
          await context.close();
        }
      }
} finally {
  await browser.close();
}
const summary = profiles.flatMap((profile) =>
  ["home", "desk"].map((view) => {
    const group = samples.filter(
      (sample) => sample.profile === profile.name && sample.view === view,
    );
    return {
      profile: profile.name,
      view,
      medianReadyMs: percentile(
        group.map((sample) => sample.readyMs),
        0.5,
      ),
      medianLcpMs: percentile(
        group.map((sample) => sample.vitals?.LCP?.value),
        0.5,
      ),
      medianInpMs: percentile(
        group.map((sample) => sample.vitals?.INP?.value),
        0.5,
      ),
      medianCls: percentile(
        group.map((sample) => sample.vitals?.CLS?.value),
        0.5,
      ),
      observedApiP50Ms: percentile(
        group.flatMap((sample) =>
          sample.apiResponses.map((response) => response.durationMs),
        ),
        0.5,
      ),
      observedApiP95Ms: percentile(
        group.flatMap((sample) =>
          sample.apiResponses.map((response) => response.durationMs),
        ),
        0.95,
      ),
    };
  }),
);
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      baseOrigin: base.origin,
      browserVersion: browser.version(),
      runsPerProfileView: runs,
      methodology:
        "Local Chromium lab runs, new browser context and disabled browser cache for each sample. Mobile network 1.6Mbps down/750Kbps up, 150ms latency, 4x CPU slowdown. Web Vitals are document-lifecycle measurements; unavailable readings remain null. Usable time includes the first forecast chart and fonts. API timings include browser/network transfer, not server-only execution. These small samples are not real-user p75 metrics and do not establish a production SLA.",
      profiles,
      summary,
      samples,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Saved ${output}`);
