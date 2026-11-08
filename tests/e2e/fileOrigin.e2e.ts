/**
 * Browser acceptance test for the office handover: one HTML file, double-clicked.
 *
 * The page is opened from `file://`, exactly as the office launches it, and the
 * test proves the whole path there: the boot probe's answer, a case, a readable
 * PDF, a reviewed value, the review bundle download, and — the point of the
 * probe — the same case still open after a reload.
 *
 * If the browser refuses storage on `file://` in this environment, the app must
 * say so in the warning banner instead of pretending; that branch is checked
 * too, so a browser change can never turn this test into a false pass.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { createSyntheticPdf } from "../../src/app/syntheticDocuments";

const PLAN_TEXT = "Section 3.2(b): Normal retirement age is 65 with 5 years of service.";

function artifactFileUrl(): string {
  return pathToFileURL(resolve("dist/index.html")).href;
}

async function openStage(page: Page, name: RegExp): Promise<void> {
  const button = page.getByRole("button", { name });
  if (!(await button.isVisible())) {
    await page.locator("summary", { hasText: "Review details" }).click();
  }
  await button.click();
}

test("keeps a case in a double-clicked HTML file, across a reload", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(artifactFileUrl());

  // The shell reports what the browser proved, not an assumption.
  const shell = page.locator(".shell");
  await expect(shell).toHaveAttribute("data-storage-mode", /persistent|session/, {
    timeout: 30_000,
  });
  const mode = await shell.getAttribute("data-storage-mode");

  if (mode === "session") {
    // Refusing honestly is the supported outcome; saving silently is not.
    await expect(page.getByRole("alert")).toContainText(
      "This tab cannot save a case",
    );
    await expect(
      page.getByText(/closing or reloading the page discards them/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create new case" }).click();
    await expect(
      page.getByRole("heading", { name: "Plan-level fields" }),
    ).toBeVisible();
    await expect(page.getByText("Open · this tab only")).toBeVisible();
    expect(consoleErrors).toEqual([]);
    return;
  }

  // Persistent: the file:// disclosure is stated, not buried.
  await expect(
    page.getByText("Cases are saved by this browser, not by this file"),
  ).toBeVisible();
  await expect(
    page.getByText(/every HTML document opened from this computer can reach the same storage/),
  ).toBeVisible();

  // A case, with the four required plan fields reviewed.
  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(page.getByRole("heading", { name: "Plan-level fields" })).toBeVisible();
  // The alias is assigned per local store, so read it rather than assume one.
  const alias = (await page.locator(".case-bar h1").innerText()).trim();
  expect(alias).toMatch(/^CW-\d{4}$/);
  await page.getByLabel("Case Identification Number").fill("CASE0003");
  await page.getByLabel("Case Number of Customer Plan").fill("1003");
  await page
    .getByLabel("Date of Plan Termination for Customer Plan")
    .fill("2024-06-30");
  await page
    .getByLabel("Plan Name of Customer Plan")
    .fill("Synthetic File Origin Plan");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();

  // The PDF is read in this tab: pdf.js and its inline worker run from a file.
  await openStage(page, /Documents/);
  await page
    .getByLabel("Document type for new files")
    .selectOption("plan-documents");
  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "file-origin-plan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      createSyntheticPdf([
        ["Synthetic File Origin Plan, restated as of January 1, 2010"],
        [PLAN_TEXT],
      ]),
    ),
  });
  await expect(page.getByText("1 active document", { exact: true })).toBeVisible();

  const planCard = page
    .locator(".artifact-card")
    .filter({ hasText: "file-origin-plan.pdf" });
  await planCard.getByRole("button", { name: "Read text" }).click();
  const panel = planCard.locator(".extracted-text");
  await expect(panel.getByText("Text available", { exact: true })).toBeVisible();
  await expect(panel.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(panel.getByText(/Normal retirement age is 65/)).toBeVisible();

  // The reviewed value and the evidence survive a reload of the local file.
  await page.reload();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-storage-mode",
    "persistent",
    { timeout: 30_000 },
  );
  await expect(page.getByLabel("Plan Name of Customer Plan")).toHaveValue(
    "Synthetic File Origin Plan",
  );
  await openStage(page, /Documents/);
  await expect(page.locator(".artifact-name")).toHaveText("file-origin-plan.pdf");

  // The review copy is produced in the tab: a printable record of the reviewed
  // plan values with its own SHA-256, generated from the case, not re-read.
  await openStage(page, /Work products/);
  await page.getByRole("button", { name: "Generate review copy" }).click();
  await expect(
    page.getByText(new RegExp(`${alias}-plan-summary-review-copy\\.html`)).first(),
  ).toBeVisible();
  await expect(page.getByText(/^[0-9a-f]{64}$/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open in new tab" }),
  ).toBeEnabled();

  // The canonical record leaves the browser as a bundle, still with no server.
  await openStage(page, /Review & export/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review bundle" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^${alias}-review-bundle-.*\\.json$`),
  );

  expect(consoleErrors).toEqual([]);
});
