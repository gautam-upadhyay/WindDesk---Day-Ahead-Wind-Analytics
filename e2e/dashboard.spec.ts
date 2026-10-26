import { expect, test } from "@playwright/test";

async function navigate(page: import("@playwright/test").Page, name: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("navigation history, cached replay and pilot shortcut work", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/day")
      requests.push(request.url());
  });
  await page.goto("/?view=desk");
  await expect(
    page.getByRole("heading", { name: "The wind picture" }),
  ).toBeVisible();
  await navigate(page, "Data & method");
  await expect(
    page.getByRole("heading", { name: "Snapshot provenance" }),
  ).toBeVisible();
  await navigate(page, "Decision desk");
  await expect(
    page.getByRole("heading", { name: "The wind picture" }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Snapshot provenance" }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Information cutoff")).toHaveValue("09:00");
  await page.getByLabel("Information cutoff").selectOption("15:00");
  await expect(
    page.getByRole("heading", { name: "The wind picture" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Information cutoff")).toHaveValue("09:00");
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(
      page.getByRole("button", { name: "Close navigation", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await menu.click();
  }
  await page
    .getByRole("button", {
      name: "Explore the January 2026 pilot data and method",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Snapshot provenance" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 768, height: 1000 });
  await navigate(page, "Decision desk");
  await expect(
    page.getByRole("heading", { name: "The wind picture" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("decision replay, hindsight, cutoff, and CSV all agree", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=desk");
  await expect(
    page.getByRole("heading", { name: "The wind picture" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Reveal actuals" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("columnheader", { name: "Actual · MW" }),
  ).toHaveCount(0);
  await page.getByRole("switch", { name: "Reveal actuals" }).click();
  await expect(page.locator(".wind-chart .recharts-line")).toHaveCount(1);
  await expect(page.getByText("Retrospective lens")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Actual · MW" }),
  ).toBeVisible();
  await page.locator(".small-select select").selectOption("error");
  await page.getByRole("switch", { name: "Reveal actuals" }).click();
  await expect(page.locator(".wind-chart .recharts-line")).toHaveCount(0);
  await expect(page.locator(".small-select select")).toHaveValue("hour");
  await expect(page.locator(".interval-panel tbody tr").first()).toContainText(
    "00:00",
  );
  await page.getByLabel("Information cutoff").selectOption("15:00");
  await expect(page).toHaveURL(/cutoff=15%3A00/);
  await expect(
    page.getByRole("heading", { name: "The wind picture" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export day" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("winddesk-2026-01-15-1500.csv");
  await page.getByLabel("Decision date").fill("2026-01-31");
  await expect(
    page.getByRole("button", { name: "Next decision day" }),
  ).toBeDisabled();
  await expect(page.getByText("1 Feb", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("accuracy heatmap drills into the point-in-time decision", async ({
  page,
}) => {
  await page.goto("/?view=accuracy&cutoff=09%3A00");
  await expect(
    page.getByRole("heading", { name: "31 decisions. Every delivery hour." }),
  ).toBeVisible();
  await expect(page.getByText(/744\/744 paired hours/)).toBeVisible();
  await page
    .getByRole("button", { name: "Replay decision 2026-01-01", exact: true })
    .click();
  await expect(page.getByLabel("Decision date")).toHaveValue("2026-01-01");
  await expect(
    page.getByRole("switch", { name: "Past-error range" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Need 48 earlier observable hours"),
  ).toBeVisible();
});

test("data provenance and responsive navigation work without overflow", async ({
  page,
}) => {
  await page.goto("/?view=desk");
  await navigate(page, "Data & method");
  await expect(
    page.getByRole("heading", { name: "Snapshot provenance" }),
  ).toBeVisible();
  await expect(page.getByText("17,864 records", { exact: true })).toBeVisible();
  await expect(page.getByTestId("upstream-verification")).toContainText(
    "Official API comparison passed.",
  );
  await expect(page.getByTestId("upstream-verification")).toContainText(
    "19,352 records matched fresh Elexon responses across 64 requests",
  );
  await page
    .getByRole("button", { name: "Show all 64 upstream requests" })
    .click();
  await expect(page.locator(".request-list li")).toHaveCount(64);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
