import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const [view, heading] of [
    ["home", "Turn tomorrow’s wind into clearer decisions."],
    ["workspace", "Make this space your own."],
    ["desk", "The wind picture"],
    ["accuracy", "31 decisions. Every delivery hour."],
    ["method", "Snapshot provenance"],
  ] as const) {
    test(`${view} in ${theme} mode has no automated WCAG A/AA accessibility violations`, async ({
      page,
    }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("winddesk-theme", value),
        theme,
      );
      await page.goto(`/?view=${view}`);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => ({
            target: node.target,
            summary: node.failureSummary,
          })),
        })),
      ).toEqual([]);
    });
  }
}
