/**
 * Office handover checks: the built artifact, the documented launch command,
 * real network blocking, and a realistic (synthetic but plausible) plan.
 *
 * Every request that is not the local server is aborted and recorded; the suite
 * fails if the app ever reaches outside its own origin. The main flow runs with
 * the browser offline for the interactive part, then returns online only to
 * reload the page (a reload has to fetch the document from the local server).
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const APP_ORIGIN = "http://127.0.0.1:4173";
const SHOTS = "artifacts/screenshots";

/**
 * Abort and record every request that leaves the app's own origin. Returning the
 * array lets a test prove the list stayed empty.
 */
async function blockExternal(context: BrowserContext): Promise<string[]> {
  const external: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === APP_ORIGIN || url.protocol === "blob:" || url.protocol === "data:") {
      await route.continue();
      return;
    }
    external.push(url.href);
    await route.abort("blockedbyclient");
  });
  return external;
}

async function openStage(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name }).click();
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Screenshot with a specific element in view, for a result worth showing. */
async function shotOf(page: Page, name: string, selector: string): Promise<void> {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** A plausible PBGC-covered single-employer plan, entirely synthetic. */
const PLAN = {
  caseId: "20461890",
  caseNumber: "1200045",
  planName: "Hopewell Precision Industries, Inc. Retirement Income Plan",
  dopt: "2019-09-30",
  participantDob: "1953-07-12",
  expectedAge: "66",
};

const EVIDENCE = [
  {
    name: "hopewell-plan-document.txt",
    mimeType: "text/plain",
    body: [
      "HOPEWELL PRECISION INDUSTRIES, INC. RETIREMENT INCOME PLAN",
      "Synthetic document created for workbench testing. Not a real plan.",
      "Plan year: calendar. Normal retirement age: 65.",
      "Benefit formula: 1.5% of final average compensation per year of service.",
      "Date of plan termination: September 30, 2019.",
    ].join("\n"),
  },
  {
    name: "hopewell-census-extract.csv",
    mimeType: "text/csv",
    body: [
      "participant_id,birth_date,status,monthly_accrued_benefit",
      "SYN-0001,1953-07-12,retired,1420.55",
      "SYN-0002,1961-02-28,active vested,860.10",
      "SYN-0003,1974-11-05,separated vested,315.00",
    ].join("\n"),
  },
  {
    name: "actuarial-memo-2019.txt",
    mimeType: "text/plain",
    body: [
      "MEMORANDUM — synthetic test fixture",
      "The assumed retirement age for deferred vested participants is 65.",
      "This memo exists only to exercise evidence intake and linking.",
    ].join("\n"),
  },
];

test("runs a realistic plan offline with zero external requests", async ({ page, context }) => {
  const external = await blockExternal(context);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  // Branding must actually paint: a decorative alt fallback is not enough.
  const logo = page.getByRole("img", { name: "PBGC" });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(100);

  await expect(page.getByRole("heading", { name: "Case workbench" })).toBeVisible();
  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(page.getByRole("heading", { name: "Plan-level fields" })).toBeVisible();

  // Offline for everything the reviewer does from here on.
  await context.setOffline(true);

  // Validation: empty submit, then an impossible date.
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByRole("alert")).toHaveCount(4);

  // A punctuation character violates the CASE rule recorded in the catalog.
  // (An impossible calendar date cannot be driven through a native date input;
  // that path is covered directly in the domain tests.)
  await page.getByLabel("Case Identification Number").fill("2046-189");
  await page.getByLabel("Case Number of Customer Plan").fill(PLAN.caseNumber);
  await page.getByLabel("Plan Name of Customer Plan").fill(PLAN.planName);
  await page.getByLabel("Date of Plan Termination for Customer Plan").fill(PLAN.dopt);
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("must be alphanumeric")).toBeVisible();
  await expect(page.getByLabel("Case Identification Number")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  await page.getByLabel("Case Identification Number").fill(PLAN.caseId);
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();
  await expect(page.getByText("Reviewed", { exact: true })).toHaveCount(4);
  await shot(page, "office-plan-summary");

  // Evidence: three files, hashed locally, each linked to a field.
  await openStage(page, /Evidence/);
  await page
    .getByLabel("Choose evidence files to import")
    .setInputFiles(
      EVIDENCE.map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        buffer: Buffer.from(file.body),
      })),
    );
  await expect(page.locator(".artifact-card")).toHaveCount(3);
  await expect(page.getByText(/SHA-256 [0-9a-f]{20}/)).toHaveCount(3);

  const targets = [
    "Plan Name of Customer Plan",
    "Date of Plan Termination for Customer Plan",
    "Case Number of Customer Plan",
  ] as const;
  for (const [index, label] of targets.entries()) {
    const card = page.locator(".artifact-card").nth(index);
    await card.getByLabel("Supports field").selectOption({ label });
    await card.getByRole("button", { name: "Link evidence" }).click();
    await expect(card.getByText("Linked to 1 field")).toBeVisible();
  }
  await shot(page, "office-evidence");

  // Duplicate content is refused by hash, not by file name.
  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "renamed-copy.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(EVIDENCE[0]!.body),
  });
  await expect(page.getByText(/already imported \(identical SHA-256\)/)).toBeVisible();
  await expect(page.locator(".artifact-card")).toHaveCount(3);

  // Calculation: 1953-07-12 at the 2019-09-30 termination date is 66.
  await openStage(page, /Calculations/);
  await page.getByLabel("Participant date of birth").fill(PLAN.participantDob);
  await page.getByLabel("As-of date").fill(PLAN.dopt);
  await page.getByRole("button", { name: "Run age calculation" }).click();
  await expect(page.locator(".result-value")).toHaveText(PLAN.expectedAge);
  await expect(page.getByText("No rounding stage (exact integer result)")).toBeVisible();
  await shotOf(page, "office-calculation", ".result-hero");

  await openStage(page, /Reconciliation/);
  await expect(page.locator(".checklist-row")).toHaveCount(5);
  await expect(
    page.locator(".checklist-row", { hasText: "Required plan fields reviewed" }),
  ).toContainText("Pass");

  await openStage(page, /Work products/);
  await page.getByRole("button", { name: "Generate review copy" }).click();
  await expect(page.getByText(/^[0-9a-f]{64}$/).first()).toBeVisible();
  await shotOf(page, "office-work-product", "#work-product-generate");

  // Export: the bundle must be complete and restorable.
  await openStage(page, /Review & export/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review bundle" }).click();
  const download = await downloadPromise;
  const bundlePath = await download.path();
  expect(bundlePath).toBeTruthy();
  const bundle = JSON.parse(await readFile(bundlePath!, "utf8")) as {
    schemaVersion: string;
    planFacts: unknown[];
    evidenceLinks: unknown[];
    artifacts: unknown[];
    auditEvents: unknown[];
  };
  expect(bundle.schemaVersion).toBe("1.0.0");
  expect(bundle.planFacts).toHaveLength(4);
  expect(bundle.evidenceLinks).toHaveLength(3);
  expect(bundle.artifacts).toHaveLength(3);
  expect(bundle.auditEvents.length).toBeGreaterThanOrEqual(9);
  await shot(page, "office-review");

  // Restore while still offline: a new case, evidence chain intact.
  await page.getByLabel("Choose a case bundle to restore").setInputFiles(bundlePath!);
  // A restore is always a new case: CW-0001 exists, so the copy becomes CW-0002.
  await expect(page.getByText(/Restored CW-0002 from/)).toBeVisible();
  await openStage(page, /Review & export/);
  await expect(
    page.locator(".key-value", { hasText: "Evidence links" }).locator("dd"),
  ).toHaveText("3");
  await expect(
    page.locator(".key-value", { hasText: "Evidence artifacts" }).locator("dd"),
  ).toHaveText("3");

  const auditRows = await page.locator(".audit-table tbody tr").count();
  expect(auditRows).toBeGreaterThan(0);

  // Back online only to re-fetch the document; reload must write no events.
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Plan-level fields" })).toBeVisible();
  await expect(page.getByLabel("Plan Name of Customer Plan")).toHaveValue(PLAN.planName);
  await openStage(page, /Review & export/);
  await expect(page.locator(".audit-table tbody tr")).toHaveCount(auditRows);
  await shot(page, "office-reload-review");

  expect(external).toEqual([]);
});

test("an offline reload keeps the case and the branding", async ({ page, context }) => {
  const external = await blockExternal(context);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await context.setOffline(true);

  await page.getByRole("button", { name: "Create new case" }).click();
  await page.getByLabel("Case Identification Number").fill("77881234");
  await page.getByLabel("Case Number of Customer Plan").fill("900145");
  await page.getByLabel("Date of Plan Termination for Customer Plan").fill("2021-12-31");
  await page.getByLabel("Plan Name of Customer Plan").fill("Synthetic Offline Reload Plan");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();

  await context.setOffline(false);
  await page.reload();
  await expect(page.getByLabel("Plan Name of Customer Plan")).toHaveValue(
    "Synthetic Offline Reload Plan",
  );
  await expect(page.getByRole("img", { name: "PBGC" })).toBeVisible();
  expect(external).toEqual([]);
});

test("opening the file directly explains the storage limitation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(pathToFileURL(resolve("dist/index.html")).href);

  await expect(page.getByRole("alert").first()).toContainText(/opened as a local file/i);
  await expect(page.getByRole("alert").first()).toContainText(/node scripts\/serve\.mjs/);

  // The logo is embedded, so branding survives even without a server.
  const logo = page.getByRole("img", { name: "PBGC" });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(100);
  await shot(page, "office-file-origin");
});
