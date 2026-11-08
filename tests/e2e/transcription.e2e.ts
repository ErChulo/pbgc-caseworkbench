/**
 * Browser check for a reviewer-transcribed passage.
 *
 * The unit tests prove the record and the store. This test proves the path a
 * reviewer takes on a real file the app cannot read: read, refusal, transcribe,
 * cite, reload, and the duplicate refusal — all in Chromium against the
 * production build, with no OCR anywhere in it.
 */

import { expect, test, type Page } from "@playwright/test";

const PASSAGE = "Section 3.2(b): Normal retirement age is 65.";

async function openStage(page: Page, name: RegExp): Promise<void> {
  const button = page.getByRole("button", { name });
  if (!(await button.isVisible())) {
    await page.locator("summary", { hasText: "Review details" }).click();
  }
  await button.click();
}

async function createCaseWithPlanFields(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan-level fields" }),
  ).toBeVisible();

  await page.getByLabel("Case Identification Number").fill("CASE0002");
  await page.getByLabel("Case Number of Customer Plan").fill("1002");
  await page
    .getByLabel("Date of Plan Termination for Customer Plan")
    .fill("2024-06-30");
  await page
    .getByLabel("Plan Name of Customer Plan")
    .fill("Synthetic Transcription Test Plan");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();
}

test("transcribes a passage from an unreadable file, cites it, and keeps it", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await createCaseWithPlanFields(page);
  await openStage(page, /Documents/);

  await page
    .getByLabel("Document type for new files")
    .selectOption("plan-documents");
  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "scanned-plan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic stand-in for a scan with no text layer.\n"),
  });
  await expect(page.locator(".artifact-name")).toHaveText("scanned-plan.txt");

  // This build has no reader for the file, and says so rather than guessing.
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(
    page.locator(".extracted-text-message", {
      hasText: "reads text from PDF, DOCX, and XLSX",
    }),
  ).toBeVisible();
  await expect(page.locator(".extracted-text-heading .status")).toHaveText(
    "No text read",
  );

  // The note must describe what the build actually does, including no OCR.
  await expect(
    page.getByRole("heading", { name: "What this build reads, and what it refuses" }),
  ).toBeVisible();
  await expect(page.getByText("There is no OCR.")).toBeVisible();

  const form = page.locator(".transcription-form");
  await form.getByLabel("Page", { exact: true }).fill("4");
  await form.getByLabel("Passage as it appears on the page").fill(PASSAGE);
  await page.getByRole("button", { name: "Record transcription" }).click();

  await expect(page.locator(".notice-banner")).toContainText(
    "Recorded a reviewer transcription",
  );
  await expect(
    page.locator(".extracted-text-list .status", {
      hasText: "Reviewer transcription",
    }),
  ).toBeVisible();
  await expect(page.locator(".extracted-text-body")).toHaveText(PASSAGE);
  await expect(page.locator(".extracted-text-locator")).toHaveText("Page 4");
  await expect(page.getByText(/1 reviewer transcription ·/)).toBeVisible();
  await expect(
    page.getByText(/Typed by the reviewer at this page\./),
  ).toBeVisible();

  // Cite the passage for a field that already has a reviewed value.
  await page
    .getByLabel("Cite a passage for")
    .selectOption({ label: "Plan Name of Customer Plan" });
  await page.getByRole("button", { name: "Cite Page 4" }).click();
  await expect(page.locator(".notice-banner")).toContainText(
    "The passage is cited for that field",
  );
  await expect(
    page.getByText("Cited for Plan Name of Customer Plan"),
  ).toBeVisible();
  await expect(
    page.locator(".link-list").getByText(/Cites a passage for/),
  ).toBeVisible();

  // The record survives a reload, with its origin and its citation.
  await page.reload();
  await openStage(page, /Documents/);
  await expect(page.locator(".extracted-text-body")).toHaveText(PASSAGE);
  await expect(
    page.locator(".extracted-text-list .status", {
      hasText: "Reviewer transcription",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Cited for Plan Name of Customer Plan"),
  ).toBeVisible();

  // The identical passage on the same page is refused, not stored twice.
  const reloadedForm = page.locator(".transcription-form");
  await reloadedForm.getByLabel("Page", { exact: true }).fill("4");
  await reloadedForm.getByLabel("Passage as it appears on the page").fill(PASSAGE);
  await page.getByRole("button", { name: "Record transcription" }).click();
  await expect(
    page.locator(".transcription-form .extracted-text-message"),
  ).toContainText("already recorded for page 4");
  await expect(page.locator(".extracted-text-body")).toHaveCount(1);

  expect(consoleErrors).toEqual([]);
});
