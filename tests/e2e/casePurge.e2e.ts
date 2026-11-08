/**
 * Browser check for the case-scoped purge.
 *
 * A purge is the one destructive action in the workbench, so the test exercises
 * the confirmation gate, the retained case record, the review-only shell, and
 * the export refusal in a real Chromium against the production build.
 */

import { expect, test, type Page } from "@playwright/test";

async function openStage(page: Page, name: RegExp): Promise<void> {
  const button = page.getByRole("button", { name });
  if (!(await button.isVisible())) {
    await page.locator("summary", { hasText: "Review details" }).click();
  }
  await button.click();
}

test("purges a case's content and leaves its audit trail readable", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan-level fields" }),
  ).toBeVisible();

  await openStage(page, /Case$/);
  await expect(
    page.getByRole("heading", { name: "Cases on this workstation" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Purge data" }).click();
  await expect(
    page.getByRole("heading", { name: "Purge case data for CW-0001" }),
  ).toBeVisible();

  const submit = page.getByRole("button", { name: "Purge case data" });
  await expect(submit).toBeDisabled();

  await page.locator(".purge-form textarea").fill("Pilot closeout after review");
  await expect(submit).toBeDisabled();

  await page.locator(".purge-form input[type='text']").fill("CW-0001");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.locator(".notice-banner")).toContainText(
    "Purged CW-0001",
  );
  await expect(page.locator(".case-purged-flag")).toHaveText(" · purged");
  await expect(page.getByText("Audit only")).toBeVisible();

  // Opening a purged case lands on the retained audit trail, not on the plan.
  await page.locator(".case-list-item").click();
  await expect(page.getByRole("heading", { name: "Case bundle" })).toBeVisible();
  await expect(page.locator(".warning-block")).toContainText(
    "This case was purged",
  );
  await expect(
    page.locator(".audit-table").getByText("case-purged", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export review bundle" }),
  ).toBeDisabled();

  // Content stages are unavailable; the review and home stages stay reachable.
  await expect(
    page.getByRole("button", { name: /Plan & people/ }),
  ).toBeDisabled();
  await expect(page.getByText("Purged · audit only")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
