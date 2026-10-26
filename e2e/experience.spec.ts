import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing preview, content, theme persistence and public entry all work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Turn tomorrow’s wind into clearer decisions.",
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Know the error" }).click();
  await expect(
    page.getByRole("heading", { name: "Make uncertainty measurable." }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Trust the source" }).click();
  await expect(
    page.getByRole("heading", { name: "Every number has a source." }),
  ).toBeVisible();
  await page
    .getByText("Why is the comparison hourly?", { exact: true })
    .click();
  await expect(
    page.getByText(/No half-hourly forecasts are invented/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to night mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to day mode" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Explore the decision desk", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The wind picture" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});

test("signup, saved preferences, session restoration, logout and login work", async ({
  page,
}) => {
  const email = `browser-${crypto.randomUUID()}@example.test`;
  const password = `Test-only-${crypto.randomUUID()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await dialog.getByLabel("Full name").fill("Test Analyst");
  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open your account" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open your account" }).click();
  await dialog.getByLabel("Default information cutoff").selectOption("15:00");
  await dialog.getByLabel("Preferred appearance").selectOption("dark");
  await dialog.getByRole("button", { name: "Save preferences" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Workspace preferences saved.",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole("button", { name: "Close account dialog" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Information cutoff")).toHaveValue("15:00");
  await page.getByRole("button", { name: "Open your account" }).click();
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill("wrong-password");
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Email or password is incorrect.",
  );
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Information cutoff")).toHaveValue("15:00");
  await page.getByRole("button", { name: "Open your account" }).click();
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
});
