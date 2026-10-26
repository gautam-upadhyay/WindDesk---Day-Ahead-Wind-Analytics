import { expect, test } from "@playwright/test";

test("saved decision search, sorting and empty results work", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "winddesk-workspace:guest",
      JSON.stringify({
        accent: "mint",
        recent: null,
        saved: [
          { date: "2026-01-18", cutoff: "09:20", note: "Evening exposure" },
          {
            date: "2026-01-03",
            cutoff: "09:00",
            note: "Review the morning revision",
          },
        ],
      }),
    );
  });
  await page.goto("/?view=workspace");
  await expect(page.locator(".saved-card")).toHaveCount(2);
  await page.getByLabel("Sort saved decisions").selectOption("oldest");
  await expect(page.locator(".saved-card").first()).toContainText("3 January");
  await page.getByLabel("Sort saved decisions").selectOption("newest");
  await expect(page.locator(".saved-card").first()).toContainText("18 January");
  const search = page.getByRole("searchbox", {
    name: "Search saved decisions",
  });
  await search.fill("evening");
  await expect(page.locator(".saved-card")).toHaveCount(1);
  await expect(page.locator(".saved-card")).toContainText("18 January");
  await search.fill("no matching note");
  await expect(
    page.getByRole("heading", { name: "No matching decisions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(".saved-card")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("saved decisions, notes and personal accent persist and replay correctly", async ({
  page,
}) => {
  await page.goto("/?view=desk&date=2026-01-18&cutoff=09%3A20");
  const cutoff = page.getByLabel("Information cutoff");
  await cutoff.focus();
  expect(
    await cutoff.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("none");
  await page
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Decision saved", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/?view=workspace");
  await expect(
    page.getByRole("heading", { name: "Saved decisions" }),
  ).toBeVisible();
  await page
    .getByLabel("Decision note")
    .fill("Inspect the evening forecast revision.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByRole("radio", { name: "Violet" }).check();
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Decision note")).toHaveValue(
    "Inspect the evening forecast revision.",
  );
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Open saved decision 2026-01-18 09:20" })
    .click();
  await expect(page.getByLabel("Decision date")).toHaveValue("2026-01-18");
  await expect(page.getByLabel("Information cutoff")).toHaveValue("09:20");
  await page.goto("/?view=workspace");
  await page
    .getByRole("button", { name: "Remove saved decision 2026-01-18 09:20" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your next good question belongs here.",
    }),
  ).toBeVisible();
});

test("profile editing and password updates are working account sections", async ({
  page,
}) => {
  const email = `profile-${crypto.randomUUID()}@example.test`;
  const password = `Original-${crypto.randomUUID()}`;
  const replacement = `Updated-${crypto.randomUUID()}`;
  await page.goto("/?view=desk");
  await page
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await page.goto("/?view=workspace");
  await page.getByLabel("Decision note").fill("Guest-only decision note.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Test Analyst");
  await dialog.getByLabel("Email address").fill(email);
  const emailOutline = await dialog
    .getByLabel("Email address")
    .evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(emailOutline).toBe("none");
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Open your account" }).click();
  await dialog.getByText("Profile details", { exact: true }).click();
  await dialog.getByLabel("Display name").fill("Jamie Analyst");
  await dialog
    .getByRole("button", { name: "Update profile", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("Profile updated.");
  await dialog.getByText("Change password", { exact: true }).click();
  await dialog.getByLabel("Current password", { exact: true }).fill(password);
  await dialog.getByLabel("New password", { exact: true }).fill(replacement);
  await dialog
    .getByLabel("Confirm new password", { exact: true })
    .fill(replacement);
  await dialog
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Password changed.");
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill(replacement);
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open your account" }),
  ).toBeVisible();
  await page.goto("/?view=workspace");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Jamie." }),
  ).toBeVisible();
  await expect(page.getByLabel("Decision note")).toHaveCount(0);
  await page.getByRole("button", { name: "Open your account" }).click();
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByLabel("Decision note")).toHaveValue(
    "Guest-only decision note.",
  );
});
