import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("home defers monthly analysis and account code until requested", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await expect(page.locator(".preview-curve")).toBeVisible();
  expect(requests.some((url) => url.includes("/api/v1/overview"))).toBe(false);
  expect(requests.some((url) => /\/assets\/Account-.*\.js/.test(url))).toBe(
    false,
  );
  await page.getByRole("tab", { name: "Know the error" }).click();
  await expect(page.locator(".preview-stats")).toContainText("GW");
  expect(requests.some((url) => url.includes("/api/v1/overview"))).toBe(true);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(requests.some((url) => /\/assets\/Account-.*\.js/.test(url))).toBe(
    true,
  );
});

test("cutoff comparison matches the four official-snapshot API analyses", async ({
  page,
}) => {
  await page.goto("/?view=accuracy");
  await page.getByRole("button", { name: "Compare all four cutoffs" }).click();
  const comparison = page.locator(".cutoff-comparison");
  await expect(
    comparison.getByText(
      "All four cutoffs use the same matched delivery hours.",
      { exact: false },
    ),
  ).toBeVisible();
  const cutoffs = ["09:00", "09:20", "15:00", "15:30"];
  for (let index = 0; index < cutoffs.length; index++) {
    const response = await page.request.get(
      `/api/v1/overview?cutoff=${cutoffs[index]}`,
    );
    const overview = await response.json();
    await expect(
      comparison.locator("tbody tr").nth(1).locator("td").nth(index),
    ).toHaveText(
      new Intl.NumberFormat("en-GB", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(overview.metrics.mae_mw / 1000),
    );
    await expect(
      comparison.locator("tbody tr").nth(4).locator("td").nth(index),
    ).toHaveText("744/744");
  }
  await comparison.getByLabel("Comparison decision date").fill("2026-01-31");
  await expect(comparison).toContainText("31 January");
  await comparison
    .getByRole("button", { name: "Use 15:00", exact: true })
    .click();
  await expect(page.getByLabel("Daily information cutoff")).toHaveValue(
    "15:00",
  );
  const audit = await new AxeBuilder({ page })
    .include(".cutoff-comparison")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});

test("a failed comparison request can be retried without losing the main analysis", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/v1/overview?cutoff=15:30", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Temporary comparison failure" }),
        })
      : route.continue(),
  );
  await page.goto("/?view=accuracy");
  await page.getByRole("button", { name: "Compare all four cutoffs" }).click();
  await expect(
    page.locator(".cutoff-comparison").getByRole("alert"),
  ).toContainText("Temporary comparison failure");
  await expect(
    page.getByRole("heading", { name: "31 decisions. Every delivery hour." }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry comparison" }).click();
  await expect(page.locator(".cutoff-comparison tbody tr")).toHaveCount(5);
});

test("heatmap cells replay the exact delivery hour and publication", async ({
  page,
}) => {
  await page.goto("/?view=accuracy&cutoff=09%3A20");
  await page
    .getByRole("button", { name: /^2026-01-18 decision, 18:00 delivery,/ })
    .click();
  await expect(page).toHaveURL(/hour=18/);
  await expect(
    page.getByRole("heading", { name: "Delivery interval · 18:00 GMT" }),
  ).toBeVisible();
  await expect(page.locator(".selected-interval")).toContainText("18:00");
  await expect(page.locator(".selected-interval")).toBeFocused();
  const response = await page.request.get(
    "/api/v1/day?decision_date=2026-01-18&cutoff=09:20",
  );
  const day = await response.json();
  const interval = day.hours.find((hour: { hour: number }) => hour.hour === 18);
  await expect(page.locator(".interval-values dd").first()).toHaveText(
    new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(
      interval.forecast_mw,
    ),
  );
  await expect(page.locator(".interval-detail")).toContainText(
    "Published forecast:",
  );
  await page.reload();
  await expect(page.locator(".selected-interval")).toContainText("18:00");
  await expect(
    page.getByRole("switch", { name: "Reveal actuals" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("unsaved notes survive canceled navigation, search and browser Back; removal has Undo", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "winddesk-workspace:guest",
      JSON.stringify({
        accent: "mint",
        recent: null,
        saved: [
          { date: "2026-01-18", cutoff: "09:20", note: "Saved original note" },
        ],
      }),
    ),
  );
  await page.goto("/?view=desk");
  await navigate(page, "My workspace");
  await page.getByLabel("Decision note").fill("Unsaved revision");
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.dismiss());
  await navigate(page, "Decision desk");
  await expect(page.getByLabel("Decision note")).toHaveValue(
    "Unsaved revision",
  );
  await page.getByRole("searchbox").fill("no results");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByLabel("Decision note")).toHaveValue(
    "Unsaved revision",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/view=workspace/);
  await expect(page.getByLabel("Decision note")).toHaveValue(
    "Unsaved revision",
  );
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Remove saved decision 2026-01-18 09:20" })
    .click();
  await page.getByRole("button", { name: "Undo removal", exact: true }).click();
  await expect(page.getByLabel("Decision note")).toHaveValue(
    "Unsaved revision",
  );
  await page.getByLabel("Decision note").fill("Discard this edit");
  page.once("dialog", (dialog) => dialog.accept());
  await navigate(page, "Decision desk");
  await expect(page.getByLabel("Decision date")).toBeVisible();
});

test("a failed chart bundle leaves the table usable and supports reload recovery", async ({
  page,
}) => {
  await page.route("**/assets/Charts-*.js", (route) => route.abort());
  await page.goto("/?view=desk");
  await expect(
    page.getByRole("heading", { name: "The wind chart could not open" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Delivery intervals" }),
  ).toBeVisible();
  await page.unroute("**/assets/Charts-*.js");
  await page.getByRole("button", { name: "Reload application" }).click();
  await expect(page.locator(".wind-chart .recharts-surface")).toBeVisible();
});
