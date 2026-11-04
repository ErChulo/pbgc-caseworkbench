/**
 * End-to-end checks in a real Chromium against the production build.
 *
 * These cover what unit tests cannot: IndexedDB persistence across reloads, a
 * hash computed in the browser, downloads, and the browser's own validation of
 * the branded shell.
 */

import { expect, test, type Page } from "@playwright/test";

const SCREENSHOTS = "artifacts/screenshots";

async function openStage(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name }).click();
}

/** Viewport screenshot from the top of the stage, for documentation. */
async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOTS}/${name}.png` });
}

test("completes the plan-field slice end to end", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");

  // Branded shell, honest first state.
  await expect(page.getByRole("heading", { name: "Case workbench" })).toBeVisible();
  await expect(page.getByRole("img", { name: "PBGC" })).toBeVisible();
  await expect(page.getByText("Create or open a case to begin")).toBeVisible();
  await expect(page.getByRole("button", { name: /Population/ })).toBeEnabled();

  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(page.getByRole("heading", { name: "Plan-level fields" })).toBeVisible();
  await expect(page.locator(".stage[aria-current='step']")).toHaveText(/Plan summary/);

  // Empty submit reports every required field, per field.
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByRole("alert")).toHaveCount(4);
  await expect(page.getByLabel("Case Identification Number")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  // A non-alphanumeric case id is rejected with the rule, not a generic error.
  await page.getByLabel("Case Identification Number").fill("CASE-001");
  await page.getByLabel("Case Number of Customer Plan").fill("1001");
  await page.getByLabel("Date of Plan Termination for Customer Plan").fill("2024-06-30");
  await page.getByLabel("Plan Name of Customer Plan").fill("Synthetic Office Test Plan");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("must be alphanumeric")).toBeVisible();

  await page.getByLabel("Case Identification Number").fill("CASE0001");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();
  await expect(page.getByText("Reviewed", { exact: true })).toHaveCount(4);
  await shot(page, "plan-summary");

  // Values survive a reload, and the reload does not create audit noise.
  await page.reload();
  await expect(page.getByLabel("Plan Name of Customer Plan")).toHaveValue(
    "Synthetic Office Test Plan",
  );
  await expect(page.getByLabel("Date of Plan Termination for Customer Plan")).toHaveValue(
    "2024-06-30",
  );

  // Evidence: import, hash, and link.
  await openStage(page, /Evidence/);
  await page
    .getByLabel("Choose evidence files to import")
    .setInputFiles({
      name: "synthetic-plan-summary.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic plan summary for the office test.\n"),
    });
  await expect(page.locator(".artifact-name")).toHaveText("synthetic-plan-summary.txt");
  await expect(page.getByText(/SHA-256 [0-9a-f]{20}/)).toBeVisible();
  await expect(page.getByText("Not linked")).toBeVisible();

  await page.getByLabel("Supports field").selectOption({ label: "Plan Name of Customer Plan" });
  await page.getByRole("button", { name: "Link evidence" }).click();
  await expect(page.getByText("Linked to 1 field")).toBeVisible();
  await shot(page, "evidence");

  // Duplicate import is refused by content hash.
  await page
    .getByLabel("Choose evidence files to import")
    .setInputFiles({
      name: "renamed-copy.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic plan summary for the office test.\n"),
    });
  await expect(page.getByText(/already imported \(identical SHA-256\)/)).toBeVisible();

  // Population: import participant records, see the age, keep benefits blocked.
  await openStage(page, /Population/);
  await page.getByLabel("Choose participant CSV to import").setInputFiles({
    name: "synthetic-participants.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "participant_key,record_type,status,date_of_birth,date_of_hire,date_of_termination,date_of_death\n" +
        "P-0001,participant,retired,1950-01-15,1975-01-15,2010-12-31,\n" +
        "P-0002,participant,separated-vested,1960-01-15,1985-01-15,,\n",
    ),
  });
  await expect(page.getByText(/Imported 2 participant records/)).toBeVisible();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".data-table tbody tr").first()).toContainText("74");
  await expect(page.locator(".data-table tbody tr").nth(1)).toContainText("64");
  await expect(page.getByText("Blocked").first()).toBeVisible();
  const registerDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download participant register" }).click();
  expect((await registerDownload).suggestedFilename()).toMatch(/participant-register\.html$/);
  await shot(page, "population");

  // Rules: the blocked provisions are visible and labelled.
  await openStage(page, /Rules & assumptions/);
  await expect(page.getByRole("heading", { name: "Earliest PBGC retirement date" })).toBeVisible();
  await expect(page.getByText("Blocked:").first()).toBeVisible();
  await expect(page.getByText("Unresolved").first()).toBeVisible();
  await shot(page, "rules");

  // Calculations: a real, exact result with a trace.
  await openStage(page, /Calculations/);
  await page.getByLabel("Participant date of birth").fill("1950-01-15");
  await page.getByLabel("As-of date").fill("2024-06-30");
  await page.getByRole("button", { name: "Run age calculation" }).click();
  await expect(page.locator(".result-value")).toHaveText("74");
  await expect(page.getByText(/completed years/i).first()).toBeVisible();
  await expect(page.getByText(/reviewer-entered value/)).toBeVisible();
  await shot(page, "calculation");

  await openStage(page, /Reconciliation/);
  await expect(page.getByRole("heading", { name: "Readiness for a work product" })).toBeVisible();
  await expect(page.locator(".checklist-row")).toHaveCount(5);

  await openStage(page, /Work products/);
  await page.getByRole("button", { name: "Generate review copy" }).click();
  await expect(page.getByText(/^[0-9a-f]{64}$/).first()).toBeVisible();
  await expect(page.getByText(/plan-summary-review-copy\.html/).first()).toBeVisible();

  // Review: export downloads a bundle.
  await openStage(page, /Review & export/);
  const auditRows = await page.locator(".audit-table tbody tr").count();
  expect(auditRows).toBeGreaterThanOrEqual(8);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review bundle" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/CW-0001-review-bundle-.*\.json$/);
  await expect(page.getByText(/Exported CW-0001-review-bundle/)).toBeVisible();
  await shot(page, "review");

  // Reload must not append audit events (the first-slice regression).
  await page.reload();
  await openStage(page, /Review & export/);
  await expect(page.locator(".audit-table tbody tr")).toHaveCount(auditRows + 1);

  // Close returns to the case list without deleting anything.
  await openStage(page, /Case home/);
  await page.getByRole("button", { name: /Close CW-0001/ }).click();
  await expect(page.getByText("Create or open a case to begin")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cases on this workstation" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("restores a bundle into a new case without overwriting the open one", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();
  await page.getByLabel("Case Identification Number").fill("CASE0002");
  await page.getByLabel("Case Number of Customer Plan").fill("2002");
  await page.getByLabel("Date of Plan Termination for Customer Plan").fill("2025-01-31");
  await page.getByLabel("Plan Name of Customer Plan").fill("Synthetic Restore Target Plan");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();

  await openStage(page, /Review & export/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review bundle" }).click();
  const download = await downloadPromise;
  const bundlePath = await download.path();
  expect(bundlePath).toBeTruthy();

  await page.getByLabel("Choose a case bundle to restore").setInputFiles(bundlePath!);
  await expect(page.getByText(/Restored CW-0002 from/)).toBeVisible();

  // The restore is a new case with a new alias, and the facts came with it.
  await expect(page.getByText("Active case")).toBeVisible();
  await openStage(page, /Case home/);
  await expect(page.locator(".case-list-item")).toHaveCount(2);
  await expect(page.locator(".case-list-item", { hasText: "CW-0002" })).toBeVisible();
});

test("is usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create new case" })).toBeVisible();
  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(page.getByRole("heading", { name: "Plan-level fields" })).toBeVisible();
  await shot(page, "mobile-plan");
});
