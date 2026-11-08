// tests/e2e/buyflow.spec.js — Playwright end-to-end test
// Run: npx playwright test

import { test, expect } from "@playwright/test";

test.describe("Buy flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://127.0.0.1:5173");
  });

  test("shows correct product when ag-grid-enterprise is in package.json", async ({
    page,
  }) => {
    // Paste a package.json with ag-grid-enterprise
    const textarea = page.locator("textarea");
    await textarea.fill('{"dependencies":{"ag-grid-enterprise":"^34.0.0"}}');
    await expect(page.locator("text=AG Grid Enterprise")).toBeVisible();
  });

  test("routes to sales for external audience", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill('{"dependencies":{"ag-grid-enterprise":"^34.0.0"}}');
    // Switch to external
    await page.selectOption("select", "external");
    await expect(page.locator("text=sales-assisted")).toBeVisible();
  });

  test("shows manager approval when over spending limit", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill('{"dependencies":{"ag-grid-enterprise":"^34.0.0"}}');
    // The test charge is $1.00; a zero-dollar approval threshold forces review.
    await page.fill('input[id="limit"]', "0");
    await expect(page.locator("text=Manager approval needed")).toBeVisible();
  });

  test("demo checkout persists a licence key without using real money", async ({
    page,
  }) => {
    const config = await (
      await page.request.get("http://127.0.0.1:5173/api/config")
    ).json();
    test.skip(
      !config.demoMode,
      "Avoid automated PayPal charges when sandbox credentials are configured.",
    );
    await page
      .locator("textarea")
      .fill('{"dependencies":{"ag-grid-enterprise":"^34.0.0"}}');
    await page
      .getByRole("button", { name: /simulate \$1 sandbox test payment/i })
      .click();
    await expect(
      page.getByText("Sandbox test payment, no real money").last(),
    ).toBeVisible();
    await expect(page.getByText(/^LP-[A-F0-9]+$/)).toBeVisible();
  });

  test("free community shows no purchase needed", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill('{"dependencies":{"react":"^18.0.0"}}');
    await expect(page.locator("text=Community edition")).toBeVisible();
  });
});

test.describe("Autopilot", () => {
  test("can run autopilot and see activity", async ({ page }) => {
    await page.goto("http://127.0.0.1:5173");
    // Navigate to autopilot
    await page.click("text=Renewal autopilot");
    await expect(page.locator("text=Policy controls")).toBeVisible();
    await page.check("#dryrun");
    // Run
    await page.click("text=Run now");
    await expect(page.getByText("dry run").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
